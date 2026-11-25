import { BadRequestException, ForbiddenException, Inject, Injectable, Logger, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { SessionService } from '../auth/session.service';
import type { SessionData } from '../common/types';
import { APP_CONFIG, AppConfig } from '../core/config';
import { DatabaseService } from '../db/database.service';
import { GuildRow, guildChannels, guilds } from '../db/schema';
import { DiscordApiError, DiscordRestService, DiscordUserGuild, type DiscordChannel } from '../discord/discord-rest.service';
import { RedisService } from '../redis/redis.service';
import { guildChannelsCacheKey, guildMetaCacheKey } from './guild-events';
import { guildBannerUrl, guildIconUrl } from '../shared/discord-cdn';
import { canManageGuild } from '../shared/permissions';
import { sha256Hex } from '../shared/crypto';
import { StatsService } from '../admin/stats.service';

const USER_GUILDS_TTL = 300;
const USER_GUILDS_STALE_TTL = 24 * 60 * 60;
const CHANNELS_TTL = 60 * 60;
const GUILD_META_TTL = 15 * 60;
const CHANNEL_COLD_MISS_LOCK_TTL = 10;
const NEGATIVE_GUILD_TTL = 5;

type CachedGuildRow = Omit<GuildRow, 'joinedAt' | 'leftAt' | 'lastSyncedAt' | 'updatedAt'> & {
  joinedAt: string;
  leftAt: string | null;
  lastSyncedAt: string | null;
  updatedAt: string;
};

export interface GuildSummary {
  id: string;
  name: string;
  iconUrl: string | null;
  owner: boolean;
  botInstalled: boolean;
  inviteUrl: string | null;
}

export interface ChannelInfo {
  id: string;
  name: string;
  category: string | null;
}

interface GuildChannelSnapshot {
  id: string;
  name: string;
  type: number;
  parentId: string | null;
  position: number;
}

const L1_TTL_MS = 15_000;
const L1_MAX_ENTRIES = 2000;

@Injectable()
export class GuildsService {
  private readonly logger = new Logger(GuildsService.name);
  private readonly inflightUserGuilds = new Map<string, Promise<DiscordUserGuild[]>>();
  private readonly userGuildsL1 = new Map<string, { value: DiscordUserGuild[]; expires: number }>();
  private readonly guildMetaL1 = new Map<string, { value: GuildRow; expires: number }>();

  private setL1<T>(map: Map<string, { value: T; expires: number }>, key: string, value: T): void {
    if (map.size >= L1_MAX_ENTRIES) {
      const oldest = map.keys().next().value;
      if (oldest) map.delete(oldest);
    }
    map.set(key, { value, expires: Date.now() + L1_TTL_MS });
  }

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly database: DatabaseService,
    private readonly redis: RedisService,
    private readonly discord: DiscordRestService,
    private readonly sessions: SessionService,
    private readonly stats: StatsService,
  ) {}

  /** Bot invite link. With a guild id the server is preselected; without one Discord lets the user choose. */
  inviteUrl(guildId?: string): string {
    const params = new URLSearchParams({
      client_id: this.config.discordClientId,
      scope: 'bot',
      permissions: this.config.botPermissions,
      response_type: 'code',
      redirect_uri: this.config.inviteRedirectUri,
    });
    if (guildId) {
      params.set('guild_id', guildId);
      params.set('disable_guild_select', 'true');
    }
    return `https://discord.com/oauth2/authorize?${params}`;
  }

  async forgetUserGuilds(userId: string): Promise<void> {
    this.userGuildsL1.delete(userId);
    await this.redis.client.del(`ug:${userId}`);
  }

  async authorizeInstalledGuild(session: SessionData | undefined, guildId: string, sid?: string): Promise<GuildRow> {
    if (!/^\d{17,20}$/.test(guildId)) throw new BadRequestException('Invalid server id');
    if (!session) throw new ForbiddenException();

    const userGuilds = await this.getUserGuilds(session, sid);
    const match = userGuilds.find((guild) => guild.id === guildId);
    if (!match || !canManageGuild(match)) throw new ForbiddenException('You need the Manage Server permission in this server');

    const row = (await this.findInstalled(guildId)) ?? (await this.registerIfBotPresent(guildId));
    if (!row) throw new NotFoundException('DexBotX is not in this server yet');
    return row;
  }


  /**
   * If the bot is already in this guild (REST) but the row is missing — e.g. guildCreate never landed —
   * insert it the same way the gateway upsert does, then return the installed row.
   */
  async registerIfBotPresent(guildId: string): Promise<GuildRow | null> {
    if (await this.redis.client.exists(`botabsent:${guildId}`)) return null;
    const lockKey = `guild:${guildId}:self-heal-lock`;
    const lockToken = randomUUID();
    const acquired = await this.redis.client.set(lockKey, lockToken, 'EX', NEGATIVE_GUILD_TTL, 'NX');
    if (acquired !== 'OK') {
      for (let attempt = 0; attempt < 10; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        const row = await this.findInstalled(guildId);
        if (row) return row;
        if (await this.redis.client.exists(`botabsent:${guildId}`)) return null;
      }
      return null;
    }

    try {
      const g = await this.discord.getGuildAsBot(guildId);
      await this.database.db
        .insert(guilds)
        .values({
          id: g.id,
          name: g.name,
          iconHash: g.icon,
          bannerHash: g.banner ?? null,
          ownerId: g.owner_id ?? null,
          memberCount: g.approximate_member_count ?? 0,
          installed: true,
          leftAt: null,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: guilds.id,
          set: {
            name: sql`excluded.name`,
            iconHash: sql`excluded.icon`,
            bannerHash: sql`excluded.banner_hash`,
            ownerId: sql`excluded.owner_id`,
            memberCount: sql`excluded.member_count`,
            installed: true,
            leftAt: null,
            updatedAt: sql`excluded.updated_at`,
          },
        });
      this.guildMetaL1.delete(guildId);
      await this.redis.client.del(guildMetaCacheKey(guildId));
      return this.findInstalled(guildId);
    } catch (error) {
      if (error instanceof DiscordApiError && (error.status === 403 || error.status === 404)) {
        await this.redis.client.set(`botabsent:${guildId}`, '1', 'EX', NEGATIVE_GUILD_TTL);
        return null;
      }
      throw error;
    } finally {
      await this.redis.client.eval(
        "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
        1,
        lockKey,
        lockToken,
      );
    }
  }

  /** The user's servers from Discord, cached with L1 + Redis single-flight coalescing and stale fallback on 429. */
  async getUserGuilds(session: SessionData, sid?: string): Promise<DiscordUserGuild[]> {
    const l1Hit = this.userGuildsL1.get(session.userId);
    if (l1Hit && l1Hit.expires > Date.now()) {
      return l1Hit.value;
    }
    const key = `ug:${session.userId}`;
    const staleKey = `ug:stale:${session.userId}`;
    const cached = await this.redis.client.get(key);
    if (cached) {
      await this.stats.hit('userGuilds');
      const parsed = JSON.parse(cached) as DiscordUserGuild[];
      this.setL1(this.userGuildsL1, session.userId, parsed);
      return parsed;
    }

    const existing = this.inflightUserGuilds.get(session.userId);
    if (existing) return existing;

    const promise = (async (): Promise<DiscordUserGuild[]> => {
      const lockKey = `ug:lock:${session.userId}`;
      const lockToken = randomUUID();
      const acquired = await this.redis.client.set(lockKey, lockToken, 'EX', 10, 'NX');
      if (acquired !== 'OK') {
        for (let attempt = 0; attempt < 25; attempt++) {
          await new Promise((resolve) => setTimeout(resolve, 80));
          const warmed = await this.redis.client.get(key);
          if (warmed) {
            await this.stats.hit('userGuilds');
            return JSON.parse(warmed) as DiscordUserGuild[];
          }
        }
      }

      try {
        const rechecked = await this.redis.client.get(key);
        if (rechecked) {
          await this.stats.hit('userGuilds');
          return JSON.parse(rechecked) as DiscordUserGuild[];
        }
        await this.stats.miss('userGuilds');
        const accessToken = this.sessions.accessToken(session);
        const [blockedUntil, userBlockedUntil] = await Promise.all([
          this.redis.client.get('discord:blocked_until'),
          this.redis.client.get(`discord:blocked:user:${sha256Hex(`Bearer ${accessToken}`)}`),
        ]);
        const now = Date.now();
        const blocked = Math.max(Number(blockedUntil ?? 0), Number(userBlockedUntil ?? 0));
        if (blocked > now) {
          const stale = await this.redis.client.get(staleKey);
          if (stale) {
            await this.redis.client.set(key, stale, 'EX', 30);
            return JSON.parse(stale) as DiscordUserGuild[];
          }
          throw new ServiceUnavailableException('Discord is temporarily rate limited and no cached server list is available.');
        }
        try {
          const list = await this.discord.getCurrentUserGuilds(accessToken);
          const serialized = JSON.stringify(list);
          await Promise.all([
            this.redis.client.set(key, serialized, 'EX', USER_GUILDS_TTL),
            this.redis.client.set(staleKey, serialized, 'EX', USER_GUILDS_STALE_TTL),
          ]);
          this.setL1(this.userGuildsL1, session.userId, list);
          return list;
        } catch (err) {
          if (err instanceof DiscordApiError && err.status === 401) {
            if (sid) await this.sessions.destroy(sid);
            throw new UnauthorizedException('Your Discord session expired. Log in again.');
          }
          if (err instanceof DiscordApiError && err.status === 429) {
            const stale = await this.redis.client.get(staleKey);
            if (stale) {
              await this.redis.client.set(key, stale, 'EX', 30);
              return JSON.parse(stale) as DiscordUserGuild[];
            }
          }
          throw err;
        }
      } finally {
        if (acquired === 'OK') {
          await this.redis.client.eval(
            "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
            1,
            lockKey,
            lockToken,
          ).catch(() => undefined);
        }
      }
    })().finally(() => {
      if (this.inflightUserGuilds.get(session.userId) === promise) {
        this.inflightUserGuilds.delete(session.userId);
      }
    });

    this.inflightUserGuilds.set(session.userId, promise);
    return promise;
  }

  async listForUser(session: SessionData, sid?: string): Promise<GuildSummary[]> {
    const manageable = (await this.getUserGuilds(session, sid)).filter(canManageGuild);
    if (manageable.length === 0) return [];
    const rows = await this.database.db
      .select({ id: guilds.id, name: guilds.name, iconHash: guilds.iconHash })
      .from(guilds)
      .where(and(inArray(guilds.id, manageable.map((g) => g.id)), eq(guilds.installed, true)));
    const installed = new Map(rows.map((row) => [row.id, row]));
    return manageable
      .map<GuildSummary>((g) => {
        const botGuild = installed.get(g.id);
        return {
          id: g.id,
          name: botGuild?.name ?? g.name,
          iconUrl: guildIconUrl(g.id, botGuild ? botGuild.iconHash : g.icon),
          owner: g.owner,
          botInstalled: !!botGuild,
          inviteUrl: botGuild ? null : this.inviteUrl(g.id),
        };
      })
      .sort((a, b) => Number(b.botInstalled) - Number(a.botInstalled) || a.name.localeCompare(b.name));
  }

  async findInstalled(guildId: string): Promise<GuildRow | null> {
    const l1Hit = this.guildMetaL1.get(guildId);
    if (l1Hit && l1Hit.expires > Date.now()) {
      return l1Hit.value;
    }
    const cached = await this.redis.client.get(guildMetaCacheKey(guildId));
    if (cached) {
      const row = JSON.parse(cached) as CachedGuildRow;
      if (!row.installed) return null;
      const hydrated: GuildRow = {
        ...row,
        joinedAt: new Date(row.joinedAt),
        leftAt: row.leftAt ? new Date(row.leftAt) : null,
        lastSyncedAt: row.lastSyncedAt ? new Date(row.lastSyncedAt) : null,
        updatedAt: new Date(row.updatedAt),
      };
      this.setL1(this.guildMetaL1, guildId, hydrated);
      return hydrated;
    }
    const rows = await this.database.db
      .select()
      .from(guilds)
      .where(and(eq(guilds.id, guildId), eq(guilds.installed, true)))
      .limit(1);
    const row = rows[0] ?? null;
    if (row) {
      await this.redis.client.set(guildMetaCacheKey(guildId), JSON.stringify(row), 'EX', GUILD_META_TTL);
      this.setL1(this.guildMetaL1, guildId, row);
    }
    return row;
  }

  toDetail(row: GuildRow) {
    return {
      id: row.id,
      name: row.name,
      iconUrl: guildIconUrl(row.id, row.iconHash),
      bannerUrl: guildBannerUrl(row.id, row.bannerHash, 600),
      memberCount: row.memberCount,
      lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
    };
  }

  /** Text and announcement channels, read from the guild-scoped database snapshot and cached briefly. */
  async getChannels(guildId: string): Promise<ChannelInfo[]> {
    const key = guildChannelsCacheKey(guildId);
    const cached = await this.redis.client.get(key);
    if (cached) {
      await this.stats.hit('channels');
      return JSON.parse(cached) as ChannelInfo[];
    }
    await this.stats.miss('channels');
    let rows = await this.selectChannelRows(guildId);
    if (rows.length === 0) {
      const lockKey = `${key}:cold-miss-lock`;
      const lockToken = randomUUID();
      const acquired = await this.redis.client.set(lockKey, lockToken, 'EX', CHANNEL_COLD_MISS_LOCK_TTL, 'NX');
      if (acquired !== 'OK') {
        for (let attempt = 0; attempt < 40; attempt++) {
          await new Promise((resolve) => setTimeout(resolve, 50));
          const warmed = await this.redis.client.get(key);
          if (warmed) return JSON.parse(warmed) as ChannelInfo[];
          rows = await this.selectChannelRows(guildId);
          if (rows.length > 0) break;
        }
        if (rows.length === 0) throw new ServiceUnavailableException('Channel data is being refreshed. Please retry shortly.');
      } else {
        try {
          const warmed = await this.redis.client.get(key);
          if (warmed) return JSON.parse(warmed) as ChannelInfo[];
          rows = await this.selectChannelRows(guildId);
          if (rows.length === 0) {
            const discordChannels = await this.discord.getGuildChannels(guildId);
            const snapshots = discordChannels
              .filter(isDisplayableChannel)
              .sort((a, b) => a.position - b.position)
              .map((channel) => ({
                guildId,
                id: channel.id,
                type: channel.type,
                name: channel.name,
                parentId: channel.parent_id,
                position: channel.position,
              }));
            if (snapshots.length > 0) {
              await this.database.db.insert(guildChannels).values(snapshots).onConflictDoUpdate({
                target: [guildChannels.guildId, guildChannels.id],
                set: {
                  name: sql`excluded.name`,
                  type: sql`excluded.type`,
                  parentId: sql`excluded.parent_id`,
                  position: sql`excluded.position`,
                },
              });
            }
            const result = this.toChannelInfo(snapshots);
            await this.redis.client.set(key, JSON.stringify(result), 'EX', CHANNELS_TTL);
            return result;
          }
        } finally {
          await this.redis.client.eval(
            "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
            1,
            lockKey,
            lockToken,
          );
        }
      }
    }
    const list = this.toChannelInfo(rows);
    await this.redis.client.set(key, JSON.stringify(list), 'EX', CHANNELS_TTL);
    return list;
  }

  private selectChannelRows(guildId: string): Promise<GuildChannelSnapshot[]> {
    return this.database.db
      .select({
        id: guildChannels.id,
        name: guildChannels.name,
        type: guildChannels.type,
        parentId: guildChannels.parentId,
        position: guildChannels.position,
      })
      .from(guildChannels)
      .where(and(eq(guildChannels.guildId, guildId), inArray(guildChannels.type, [0, 4, 5])))
      .orderBy(guildChannels.position);
  }

  private toChannelInfo(rows: GuildChannelSnapshot[]): ChannelInfo[] {
    const categories = new Map(rows.filter((row) => row.type === 4).map((row) => [row.id, row.name]));
    return rows
      .filter((row) => row.type === 0 || row.type === 5)
      .map((row) => ({ id: row.id, name: row.name, category: row.parentId ? (categories.get(row.parentId) ?? null) : null }));
  }
}

function isDisplayableChannel(channel: DiscordChannel): boolean {
  return channel.type === 0 || channel.type === 4 || channel.type === 5;
}
