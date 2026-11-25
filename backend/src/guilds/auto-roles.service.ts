import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { GuildSyncService, type CachedRole } from '../bot/guild-sync.service';
import { SessionData } from '../common/types';
import type { APIEmbed } from 'discord.js';
import { DatabaseService } from '../db/database.service';
import { auditLogs, autoRoleEvents, guildSettings, type GuildRow } from '../db/schema';
import { ChannelAccessService } from '../discord/channel-access.service';
import { DiscordApiError, DiscordRestService } from '../discord/discord-rest.service';
import { RedisService } from '../redis/redis.service';
import { SettingsCache } from '../redis/settings-cache.service';
import {
  autoRoleConfigSchema,
  normalizeAutoRoleConfig,
  renderAutoRoleEmbed,
  renderAutoRoleTemplate,
  validateAutoRoleTemplate,
  getAutoRoleSafetyReason,
  escapeDiscordMentions,
  type AutoRoleBotStatus,
  type AutoRoleConfig,
} from '../shared/auto-roles';
import { GuildsService } from './guilds.service';

const CHANNEL_STATUS_TTL_SECONDS = 5 * 60;

export interface AutoRoleHiddenRole {
  id: string;
  name: string;
  reason: 'bot or integration role' | 'everyone' | 'above the bot\'s role' | 'has admin or moderation permissions';
}

export interface AutoRoleResponse {
  config: AutoRoleConfig;
  roles: {
    assignable: Array<{ id: string; name: string; color: number; position: number }>;
    hidden: AutoRoleHiddenRole[];
  };
  checks: {
    hasManageRoles: boolean;
    roleBelowBot: boolean;
    canSendInChannel: boolean;
  };
  canTest: boolean;
}

export interface AutoRoleEventRow {
  id: number;
  guildId: string;
  userId: string;
  roleId: string;
  outcome: 'assigned' | 'skipped_left' | 'skipped_has_role' | 'skipped_unsafe' | 'failed';
  createdAt: string;
}


@Injectable()
export class AutoRolesService {
  private readonly logger = new Logger(AutoRolesService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly cache: SettingsCache,
    private readonly guildSync: GuildSyncService,
    private readonly guilds: GuildsService,
    private readonly channelAccess: ChannelAccessService,
    private readonly discord: DiscordRestService,
    private readonly redis: RedisService,
  ) {}

  async get(guild: GuildRow): Promise<AutoRoleResponse> {
    const settings = await this.cache.get(guild.id);
    const config = normalizeAutoRoleConfig(settings.autoRoles);
    const roles = await this.guildSync.getRoles(guild.id);
    const botStatus = await this.guildSync.getBotStatus(guild.id, roles);
    const roleView = this.classifyRoles(guild.id, roles, botStatus);
    const selectedId = config.roleIds[0];
    const canSendInChannel = config.announce.channelId
      ? await this.canSendInChannel(config.announce.channelId)
      : false;
    return {
      config,
      roles: roleView,
      checks: {
        hasManageRoles: botStatus.manageRoles,
        roleBelowBot: !!selectedId && roleView.assignable.some((role) => role.id === selectedId),
        canSendInChannel,
      },
      canTest: config.announce.enabled && !!config.announce.channelId,
    };
  }

  async save(guild: GuildRow, session: SessionData, input: unknown): Promise<AutoRoleResponse> {
    const parsed = autoRoleConfigSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Validation failed',
        issues: parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
      });
    }
    const config = normalizeAutoRoleConfig(parsed.data);
    config.announce.message = escapeDiscordMentions(config.announce.message);
    config.announce.embed.title = escapeDiscordMentions(config.announce.embed.title);
    config.announce.embed.description = escapeDiscordMentions(config.announce.embed.description);
    config.announce.embed.footer = escapeDiscordMentions(config.announce.embed.footer);
    const roles = await this.guildSync.getRoles(guild.id);
    const botStatus = await this.guildSync.getBotStatus(guild.id, roles);
    const roleView = this.classifyRoles(guild.id, roles, botStatus);

    if (config.roleIds.length) {
      const roleId = config.roleIds[0];
      if (!roleView.assignable.some((role) => role.id === roleId)) {
        throw new BadRequestException({
          message: 'Validation failed',
          issues: [{ path: 'roleIds', message: 'Choose an assignable role below the bot in the role hierarchy' }],
        });
      }
    }

    let channelToRefresh: string | null = null;
    if (config.announce.channelId) {
      const channels = await this.guilds.getChannels(guild.id);
      const channel = channels.find((item) => item.id === config.announce.channelId);
      if (!channel) {
        throw new BadRequestException({
          message: 'Validation failed',
          issues: [{ path: 'announce.channelId', message: 'That channel does not exist in this server' }],
        });
      }
      if (config.announce.enabled) channelToRefresh = channel.id;
    }

    const templateIssues = validateAutoRoleTemplate(config.announce.message);
    if (!templateIssues.valid) {
      throw new BadRequestException({
        message: 'Validation failed',
        issues: [{ path: 'announce.message', message: templateIssues.issues.join('. ') }],
      });
    }

    const existing = await this.cache.get(guild.id);
    const now = new Date();
    await this.database.db.transaction(async (tx) => {
      const settings = await tx.select().from(guildSettings).where(eq(guildSettings.guildId, guild.id)).limit(1);
      if (settings[0]) {
        await tx.update(guildSettings)
          .set({ autoRoles: config, updatedBy: session.userId, updatedAt: now })
          .where(eq(guildSettings.guildId, guild.id));
      } else {
        await tx.insert(guildSettings).values({
          guildId: guild.id,
          welcome: existing.welcome,
          goodbye: existing.goodbye,
          autoRoles: config,
          updatedBy: session.userId,
          updatedAt: now,
        });
      }
      await tx.insert(auditLogs).values({ guildId: guild.id, userId: session.userId, action: 'auto_roles.update' });
    });
    await this.cache.invalidate(guild.id);
    await this.publishRevision(guild.id, 'settings', 'updated');
    if (channelToRefresh) {
      void this.refreshChannelAccess(guild.id, channelToRefresh, config.announce.embed.enabled).catch((error: unknown) => {
        this.logger.error(
          `Auto Roles channel permission refresh failed guild=${guild.id} channel=${channelToRefresh}: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
    }

    return {
      config,
      roles: roleView,
      checks: {
        hasManageRoles: botStatus.manageRoles,
        roleBelowBot: !!config.roleIds[0] && roleView.assignable.some((role) => role.id === config.roleIds[0]),
        canSendInChannel: config.announce.channelId
          ? await this.canSendInChannel(config.announce.channelId)
          : false,
      },
      canTest: config.announce.enabled && !!config.announce.channelId,
    };
  }

  classifyRoles(
    guildId: string,
    roles: CachedRole[],
    botStatus: AutoRoleBotStatus,
  ): { assignable: Array<{ id: string; name: string; color: number; position: number }>; hidden: AutoRoleHiddenRole[] } {
    const assignable: Array<{ id: string; name: string; color: number; position: number }> = [];
    const hidden: AutoRoleHiddenRole[] = [];
    for (const role of roles) {
      const reason = getAutoRoleSafetyReason(guildId, role, botStatus);
      if (reason) hidden.push({ id: role.id, name: role.name, reason });
      else assignable.push({ id: role.id, name: role.name, color: role.color, position: role.position });
    }
    assignable.sort((a, b) => b.position - a.position);
    hidden.sort((a, b) => a.name.localeCompare(b.name));
    return { assignable, hidden };
  }


  async canSendInChannel(channelId: string): Promise<boolean> {
    return (await this.redis.client.get(this.channelStatusKey(channelId))) === '1';
  }

  private channelStatusKey(channelId: string): string {
    return `guild:auto-roles:channel-status:${channelId}`;
  }

  private async refreshChannelAccess(guildId: string, channelId: string, includeEmbed: boolean): Promise<void> {
    const fixed = await this.channelAccess.ensureChannelAccess(guildId, channelId);
    if (fixed !== 'fixed') {
      this.logger.debug(`Channel access check guild=${guildId} channel=${channelId} result=${fixed}`);
    }

    let canSend = false;
    try {
      canSend = await this.discord.canBotPost(channelId, includeEmbed);
    } catch (error) {
      if (!(error instanceof DiscordApiError) || ![403, 404].includes(error.status)) throw error;
    }
    await this.redis.client.set(this.channelStatusKey(channelId), canSend ? '1' : '0', 'EX', CHANNEL_STATUS_TTL_SECONDS);
    await this.publishRevision(guildId, 'settings', 'updated');
  }

  private channelPermissionMessage(channelName: string, includeEmbed: boolean): string {
    const permissions = includeEmbed
      ? 'View Channel, Send Messages and Embed Links'
      : 'View Channel and Send Messages';
    return `DexBotX cannot post in #${channelName}. Give the bot ${permissions} there.`;
  }

  async test(guild: GuildRow, session: SessionData): Promise<{ channelId: string }> {
    const config = (await this.cache.get(guild.id)).autoRoles;
    if (!config.announce.enabled || !config.announce.channelId) {
      throw new BadRequestException('Enable announcements and choose a channel before sending a test');
    }
    const channels = await this.guilds.getChannels(guild.id);
    const channel = channels.find((item) => item.id === config.announce.channelId);
    if (!channel) throw new BadRequestException('The saved announcement channel no longer exists');
    const roleId = config.roleIds[0];
    const role = roleId ? (await this.guildSync.getRoles(guild.id)).find((item) => item.id === roleId) : undefined;
    const roleName = role?.name ?? 'Member';
    const values = {
      username: session.username,
      roleName,
      serverName: guild.name,
      memberCount: guild.memberCount,
      userMentions: [`<@${session.userId}>`],
    };
    const content = renderAutoRoleTemplate(config.announce.message, values).slice(0, 2000);
    const embeds: APIEmbed[] = [];
    if (config.announce.embed.enabled) {
      embeds.push(renderAutoRoleEmbed(config.announce.embed, values));
    }
    try {
      await this.discord.createMessage(channel.id, { content, embeds }, [session.userId]);
    } catch (error) {
      if (error instanceof DiscordApiError && error.status === 403) {
        const result = await this.channelAccess.ensureChannelAccess(guild.id, channel.id);
        if (result === 'fixed') {
          try {
            await this.discord.createMessage(channel.id, { content, embeds }, [session.userId]);
            await this.redis.client.set(this.channelStatusKey(channel.id), '1', 'EX', CHANNEL_STATUS_TTL_SECONDS);
            return { channelId: channel.id };
          } catch (retryError) {
            if (retryError instanceof DiscordApiError && retryError.status === 403) {
              await this.redis.client.set(this.channelStatusKey(channel.id), '0', 'EX', CHANNEL_STATUS_TTL_SECONDS);
              throw new BadRequestException(this.channelPermissionMessage(channel.name, config.announce.embed.enabled));
            }
            throw retryError;
          }
        }
      }
      if (error instanceof DiscordApiError && (error.status === 403 || error.status === 404)) {
        await this.redis.client.set(this.channelStatusKey(channel.id), '0', 'EX', CHANNEL_STATUS_TTL_SECONDS);
        throw new BadRequestException(this.channelPermissionMessage(channel.name, config.announce.embed.enabled));
      }
      throw error;
    }
    return { channelId: channel.id };
  }

  async activity(guildId: string): Promise<AutoRoleEventRow[]> {
    const rows = await this.database.db
      .select()
      .from(autoRoleEvents)
      .where(eq(autoRoleEvents.guildId, guildId))
      .orderBy(desc(autoRoleEvents.createdAt))
      .limit(20);
    return rows.map((row) => ({
      id: row.id,
      guildId: row.guildId,
      userId: row.userId,
      roleId: row.roleId,
      outcome: row.outcome as AutoRoleEventRow['outcome'],
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async publishRevision(guildId: string, kind: string, type: string): Promise<void> {
    const rev = await this.redis.client.incr(`guild:${guildId}:rev`);
    await this.redis.client.publish(`guild:${guildId}:events`, JSON.stringify({
      type,
      guildId,
      kind,
      data: {},
      rev,
    }));
  }

}
