import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Inject, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { PermissionFlagsBits } from 'discord.js';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { APP_CONFIG, type AppConfig } from '../core/config';
import { DatabaseService } from '../db/database.service';
import { economySettings, economyAuditLog, shopItems } from '../db/schema';
import { GuildAccessGuard } from '../guilds/guild-access.guard';
import type { AuthedRequest } from '../common/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ECONOMY_LIMITS } from './economy.constants';
import { RateLimit } from '../common/decorators';
import { EconomySetupService } from './economy-setup.service';
import { economySettingsSchema, defaultEconomySettings, type EconomySettings } from './economy.schema';
import { DiscordRestService, type DiscordRole } from '../discord/discord-rest.service';
import { isBotOrManagedRole, roleSafetyReason } from './economy-safety';
import { EconomyMessageService } from './economy-message.service';
import { compareAutoRoleHierarchy } from '../shared/auto-roles';

const shopItemSchema = z.object({
  itemId: z.string().min(1).max(64).optional(),
  kind: z.enum(['shield', 'rob_more', 'lockpick', 'decoy', 'bounty', 'daily_boost', 'custom_title', 'randomdex', 'role']),
  name: z.string().trim().min(1).max(100),
  description: z.string().max(300).default(''),
  price: z.number().int().min(ECONOMY_LIMITS.itemPrice[0]).max(ECONOMY_LIMITS.itemPrice[1]),
  roleId: z.string().regex(/^\d{17,20}$/).nullable().optional(),
  stock: z.number().int().min(0).nullable().optional(),
  enabled: z.boolean(),
}).strict();

function findHighestBotRole(roles: DiscordRole[], botRoleIds: string[]): DiscordRole | undefined {
  return roles
    .filter((role) => botRoleIds.includes(role.id))
    .reduce<DiscordRole | undefined>(
      (highest, role) => (!highest || compareAutoRoleHierarchy(role, highest) > 0 ? role : highest),
      undefined,
    );
}

@Controller('guilds/:guildId/economy')
@UseGuards(GuildAccessGuard)
export class EconomyController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly setup: EconomySetupService,
    private readonly database: DatabaseService,
    private readonly discord: DiscordRestService,
    private readonly messages: EconomyMessageService,
  ) {}

  private botClientId(): string {
    return this.config.discordClientId || process.env.DISCORD_CLIENT_ID || '';
  }

  private async ensureEconomyAdmin(guildId: string, req: AuthedRequest): Promise<void> {
    const guild = req.guild!;
    if (guild.ownerId === req.session!.userId) return;
    const [roles, member] = await Promise.all([
      this.discord.getGuildRoles(guildId),
      this.discord.getGuildMember(guildId, req.session!.userId),
    ]);
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
    await this.setup.updateSettings(guildId, settings, req.session!.userId, req.guild!.name);
    return { settings };
  }

  @Get('items')
  async items(@Param('guildId') guildId: string) {
    return { items: await this.setup.getItems(guildId) };
  }

  @Post('items')
  async createItem(
    @Param('guildId') guildId: string,
    @Req() req: AuthedRequest,
    @Body(new ZodValidationPipe(shopItemSchema)) body: z.infer<typeof shopItemSchema>,
  ) {
    if (body.kind === 'role') {
      if (!body.roleId) throw new BadRequestException('A role is required for role items.');
      const [roles, botMember] = await Promise.all([
        this.discord.getGuildRoles(guildId),
        this.discord.getGuildMember(guildId, this.botClientId()),
      ]);
      const role = roles.find((item) => item.id === body.roleId);
      if (!role) throw new BadRequestException('Role not found.');
      const highestBotRole = findHighestBotRole(roles, botMember.roles);
      const reason = roleSafetyReason(role, guildId, highestBotRole?.position ?? -1, highestBotRole?.id ?? null);
      if (reason) throw new BadRequestException(reason);
    }
    const existing = await this.database.db.select({ id: shopItems.id }).from(shopItems)
      .where(eq(shopItems.guildId, guildId)).orderBy(shopItems.sortOrder);
    const itemId = body.itemId ?? `item-${Date.now()}-${existing.length}`;
    const [created] = await this.database.db.insert(shopItems).values({
      guildId, itemId, kind: body.kind, name: body.name, description: body.description,
      price: body.price, roleId: body.roleId ?? null, stock: body.stock ?? null,
      enabled: body.enabled, isDefault: false, sortOrder: existing.length,
    }).returning();
    await Promise.all([
      this.database.db.insert(economyAuditLog).values({
        guildId, actorId: req.session!.userId, source: 'dashboard', action: 'economy.item.create',
        after: body as unknown as Record<string, unknown>,
      }),
      this.setup.invalidateCache(guildId),
    ]);
    this.messages.scheduleStoreAndRulesSync(guildId, req.guild!.name);
    return { ok: true, item: created };
  }

  @Put('items/:itemId')
  async updateItem(
    @Param('guildId') guildId: string,
    @Param('itemId') itemId: string,
    @Req() req: AuthedRequest,
    @Body(new ZodValidationPipe(shopItemSchema.partial())) body: Partial<z.infer<typeof shopItemSchema>>,
  ) {
    await Promise.all([
      this.database.db.update(shopItems).set({
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.price !== undefined ? { price: body.price } : {}),
        ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
        ...(body.stock !== undefined ? { stock: body.stock } : {}),
        ...(body.roleId !== undefined ? { roleId: body.roleId } : {}),
      }).where(and(eq(shopItems.guildId, guildId), eq(shopItems.itemId, itemId))),
      this.database.db.insert(economyAuditLog).values({
        guildId, actorId: req.session!.userId, source: 'dashboard', action: 'economy.item.update',
        after: body as unknown as Record<string, unknown>,
      }),
    ]);
    await this.setup.invalidateCache(guildId);
    this.messages.scheduleStoreAndRulesSync(guildId, req.guild!.name);
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
    await Promise.all([
      this.database.db.insert(economyAuditLog).values({
        guildId, actorId: req.session!.userId, source: 'dashboard', action: 'economy.items.reorder',
        after: { itemIds: body.itemIds },
      }),
      this.setup.invalidateCache(guildId),
    ]);
    this.messages.scheduleStoreAndRulesSync(guildId, req.guild!.name);
    return { ok: true };
  }

  @Delete('items/:itemId')
  async deleteItem(@Param('guildId') guildId: string, @Param('itemId') itemId: string, @Req() req: AuthedRequest) {
    await Promise.all([
      this.database.db.delete(shopItems).where(and(eq(shopItems.guildId, guildId), eq(shopItems.itemId, itemId))),
      this.database.db.insert(economyAuditLog).values({
        guildId, actorId: req.session!.userId, source: 'dashboard', action: 'economy.item.delete',
        after: { itemId },
      }),
    ]);
    await this.setup.invalidateCache(guildId);
    this.messages.scheduleStoreAndRulesSync(guildId, req.guild!.name);
    return { ok: true };
  }

  @Get('roles')
  async safeRoles(@Param('guildId') guildId: string) {
    const [roles, botMember] = await Promise.all([
      this.discord.getGuildRoles(guildId),
      this.discord.getGuildMember(guildId, this.botClientId()),
    ]);
    const highestBotRole = findHighestBotRole(roles, botMember.roles);
    const botHighestPosition = highestBotRole?.position ?? -1;
    const botHighestRoleId = highestBotRole?.id ?? null;

    return {
      roles: roles
        .filter((role) => role.id !== guildId && !isBotOrManagedRole(role))
        .map((role) => ({
          id: role.id,
          name: role.name,
          color: role.color,
          position: role.position,
          reason: roleSafetyReason(role, guildId, botHighestPosition, botHighestRoleId),
        }))
        .sort((a, b) => b.position - a.position),
    };
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
    const channelIds = [
      row.rulesChannelId,
      row.commandsChannelId,
      row.leaderboardChannelId,
      row.storeChannelId,
      row.heistLogChannelId,
      row.announcementsChannelId,
      row.categoryId,
    ].filter((id): id is string => Boolean(id));
    await Promise.all(channelIds.map((id) => this.discord.deleteGuildChannel(id).catch(() => undefined)));
    await Promise.all([
      this.database.db.update(economySettings).set({
        enabled: false,
        categoryId: null,
        rulesChannelId: null,
        commandsChannelId: null,
        leaderboardChannelId: null,
        storeChannelId: null,
        heistLogChannelId: null,
        announcementsChannelId: null,
      }).where(eq(economySettings.guildId, guildId)),
      this.database.db.insert(economyAuditLog).values({
        guildId, actorId: req.session!.userId, source: 'dashboard', action: 'economy.channels.delete',
      }),
    ]);
    await this.setup.invalidateCache(guildId);
    return { ok: true };
  }
}
