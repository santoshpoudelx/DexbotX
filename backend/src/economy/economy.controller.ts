import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { PermissionFlagsBits } from 'discord.js';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { DatabaseService } from '../db/database.service';
import { economySettings, economyAuditLog, shopItems } from '../db/schema';
import { GuildAccessGuard } from '../guilds/guild-access.guard';
import type { AuthedRequest } from '../common/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ECONOMY_LIMITS } from './economy.constants';
import { RateLimit } from '../common/decorators';
import { EconomySetupService } from './economy-setup.service';
import { economySettingsSchema, defaultEconomySettings, type EconomySettings } from './economy.schema';
import { DiscordRestService } from '../discord/discord-rest.service';
import { roleSafetyReason } from './economy-safety';
import { EconomyMessageService } from './economy-message.service';

const shopItemSchema = z.object({
  itemId: z.string().min(1).max(64).optional(),
  kind: z.enum(['shield', 'rob_more', 'lockpick', 'decoy', 'bounty', 'daily_boost', 'custom_title', 'role']),
  name: z.string().trim().min(1).max(100),
  description: z.string().max(300).default(''),
  price: z.number().int().min(ECONOMY_LIMITS.itemPrice[0]).max(ECONOMY_LIMITS.itemPrice[1]),
  roleId: z.string().regex(/^\d{17,20}$/).nullable().optional(),
  stock: z.number().int().min(0).nullable().optional(),
  enabled: z.boolean(),
}).strict();

@Controller('guilds/:guildId/economy')
@UseGuards(GuildAccessGuard)
export class EconomyController {
  constructor(
    private readonly setup: EconomySetupService,
    private readonly database: DatabaseService,
    private readonly discord: DiscordRestService,
    private readonly messages: EconomyMessageService,
  ) {}

  private async ensureEconomyAdmin(guildId: string, req: AuthedRequest): Promise<void> {
    const guild = req.guild!;
    if (guild.ownerId === req.session!.userId) return;
    const roles = await this.discord.getGuildRoles(guildId);
    const member = await this.discord.getGuildMember(guildId, req.session!.userId);
    let permissions = 0n;
    for (const role of roles) {
      if (role.id === guildId || member.roles.includes(role.id)) {
        permissions |= BigInt(role.permissions ?? '0');
      }
    }
    if ((permissions & PermissionFlagsBits.Administrator) === 0n) {
      throw new ForbiddenException('Only the server owner or a member with Administrator can pause or resume the economy.');
    }
  }

  @Get()
  async get(@Param('guildId') guildId: string) {
    const data = await this.setup.get(guildId);
    if (data) return data;
    return {
      settings: defaultEconomySettings(),
      state: await this.setup.status(guildId, 0),
    };
  }

  @Post('enable')
  @RateLimit('economy-enable', 3)
  async enable(@Param('guildId') guildId: string, @Req() req: AuthedRequest) {
    const guild = req.guild!;
    return this.setup.enable(guildId, guild.name, req.session!.userId, 'dashboard');
  }

  @Post('disable')
  async disable(@Param('guildId') guildId: string, @Req() req: AuthedRequest) {
    await this.setup.disable(guildId, req.session!.userId, 'dashboard');
    return { ok: true };
  }

  @Post('pause')
  async pause(@Param('guildId') guildId: string, @Req() req: AuthedRequest) {
    await this.ensureEconomyAdmin(guildId, req);
    await this.setup.pause(guildId, req.session!.userId, 'dashboard');
    return { ok: true };
  }

  @Post('resume')
  async resume(@Param('guildId') guildId: string, @Req() req: AuthedRequest) {
    await this.ensureEconomyAdmin(guildId, req);
    await this.setup.resume(guildId, req.session!.userId, 'dashboard');
    return { ok: true };
  }

  @Put('settings')
  async updateSettings(
    @Param('guildId') guildId: string,
    @Req() req: AuthedRequest,
    @Body(new ZodValidationPipe(economySettingsSchema)) settings: EconomySettings,
  ) {
    await this.setup.updateSettings(guildId, settings, req.session!.userId);
    await this.messages.updateRules(guildId, req.guild!.name);
    await this.messages.updateStore(guildId);
    await this.messages.refreshLeaderboard(guildId);
    await this.messages.updateRobbingInfo(guildId);
    return { settings };
  }

  @Get('items')
  async items(@Param('guildId') guildId: string) {
    return { items: await this.database.db.select().from(shopItems)
      .where(eq(shopItems.guildId, guildId)).orderBy(shopItems.sortOrder) };
  }

  @Post('items')
  async createItem(
    @Param('guildId') guildId: string,
    @Req() req: AuthedRequest,
    @Body(new ZodValidationPipe(shopItemSchema)) body: z.infer<typeof shopItemSchema>,
  ) {
    if (body.kind === 'role') {
      if (!body.roleId) throw new BadRequestException('A role is required for role items.');
      const roles = await this.discord.getGuildRoles(guildId);
      const role = roles.find((item) => item.id === body.roleId);
      if (!role) throw new BadRequestException('Role not found.');
      const botMember = await this.discord.getGuildMember(guildId, (process.env.DISCORD_CLIENT_ID ?? ''));
      const botHighestPosition = Math.max(...roles.filter((item) => botMember.roles.includes(item.id)).map((item) => item.position), -1);
      const reason = roleSafetyReason({ ...role, position: role.position }, guildId, botHighestPosition);
      if (reason) throw new BadRequestException(reason);
    }
    const existing = await this.database.db.select({ id: shopItems.id }).from(shopItems)
      .where(eq(shopItems.guildId, guildId)).orderBy(shopItems.sortOrder);
    const itemId = body.itemId ?? `item-${Date.now()}-${existing.length}`;
    await this.database.db.insert(shopItems).values({
      guildId, itemId, kind: body.kind, name: body.name, description: body.description,
      price: body.price, roleId: body.roleId ?? null, stock: body.stock ?? null,
      enabled: body.enabled, isDefault: false, sortOrder: existing.length,
    });
    await this.database.db.insert(economyAuditLog).values({
      guildId, actorId: req.session!.userId, source: 'dashboard', action: 'economy.item.create',
      after: body as unknown as Record<string, unknown>,
    });
    await this.messages.updateStore(guildId);
    await this.messages.updateRules(guildId, req.guild!.name);
    return { ok: true };
  }

  @Put('items/:itemId')
  async updateItem(
    @Param('guildId') guildId: string,
    @Param('itemId') itemId: string,
    @Req() req: AuthedRequest,
    @Body(new ZodValidationPipe(shopItemSchema.partial())) body: Partial<z.infer<typeof shopItemSchema>>,
  ) {
    await this.database.db.update(shopItems).set({
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.price !== undefined ? { price: body.price } : {}),
      ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
      ...(body.stock !== undefined ? { stock: body.stock } : {}),
      ...(body.roleId !== undefined ? { roleId: body.roleId } : {}),
    }).where(and(eq(shopItems.guildId, guildId), eq(shopItems.itemId, itemId)));
    await this.database.db.insert(economyAuditLog).values({
      guildId, actorId: req.session!.userId, source: 'dashboard', action: 'economy.item.update',
      after: body as unknown as Record<string, unknown>,
    });
    await this.messages.updateStore(guildId);
    await this.messages.updateRules(guildId, req.guild!.name);
    return { ok: true };
  }

  @Put('items-reorder')
  async reorderItems(
    @Param('guildId') guildId: string,
    @Req() req: AuthedRequest,
    @Body() body: { itemIds: string[] },
  ) {
    if (!Array.isArray(body.itemIds) || body.itemIds.length > 1000
      || body.itemIds.some((itemId) => typeof itemId !== 'string' || itemId.length > 64)) {
      throw new BadRequestException('itemIds must be a bounded list of item IDs.');
    }
    await this.database.db.transaction(async (tx) => {
      for (const [sortOrder, itemId] of body.itemIds.entries()) {
        await tx.update(shopItems).set({ sortOrder })
          .where(and(eq(shopItems.guildId, guildId), eq(shopItems.itemId, itemId)));
      }
    });
    await this.database.db.insert(economyAuditLog).values({
      guildId, actorId: req.session!.userId, source: 'dashboard', action: 'economy.items.reorder',
      after: { itemIds: body.itemIds },
    });
    await this.messages.updateStore(guildId);
    await this.messages.updateRules(guildId, req.guild!.name);
    return { ok: true };
  }

  @Delete('items/:itemId')
  async deleteItem(@Param('guildId') guildId: string, @Param('itemId') itemId: string, @Req() req: AuthedRequest) {
    await this.database.db.delete(shopItems).where(and(eq(shopItems.guildId, guildId), eq(shopItems.itemId, itemId)));
    await this.database.db.insert(economyAuditLog).values({
      guildId, actorId: req.session!.userId, source: 'dashboard', action: 'economy.item.delete',
      after: { itemId },
    });
    await this.messages.updateStore(guildId);
    await this.messages.updateRules(guildId, req.guild!.name);
    return { ok: true };
  }

  @Get('roles')
  async safeRoles(@Param('guildId') guildId: string) {
    const roles = await this.discord.getGuildRoles(guildId);
    const botMember = await this.discord.getGuildMember(guildId, process.env.DISCORD_CLIENT_ID ?? '');
    const botHighestPosition = Math.max(...roles.filter((role) => botMember.roles.includes(role.id)).map((role) => role.position), -1);
    return { roles: roles.map((role) => ({
      id: role.id,
      name: role.name,
      color: role.color,
      position: role.position,
      reason: roleSafetyReason(role, guildId, botHighestPosition),
    })).filter((role) => role.id !== guildId).sort((a, b) => b.position - a.position) };
  }

  @Post('delete-channels')
  async deleteChannels(
    @Param('guildId') guildId: string,
    @Req() req: AuthedRequest,
    @Body() body: { confirm: boolean },
  ) {
    if (body.confirm !== true) throw new BadRequestException('Explicit confirm is required.');
    const rows = await this.database.db.select().from(economySettings).where(eq(economySettings.guildId, guildId)).limit(1);
    const row = rows[0];
    if (!row) return { ok: true };
    for (const id of [row.rulesChannelId, row.commandsChannelId, row.leaderboardChannelId, row.storeChannelId, row.heistLogChannelId, row.announcementsChannelId]) {
      if (id) await this.discord.deleteGuildChannel(id).catch(() => undefined);
    }
    await this.database.db.update(economySettings).set({
      enabled: false,
      categoryId: null,
      rulesChannelId: null,
      commandsChannelId: null,
      leaderboardChannelId: null,
      storeChannelId: null,
      heistLogChannelId: null,
      announcementsChannelId: null,
    }).where(eq(economySettings.guildId, guildId));
    await this.database.db.insert(economyAuditLog).values({
      guildId, actorId: req.session!.userId, source: 'dashboard', action: 'economy.channels.delete',
    });
    return { ok: true };
  }
}
