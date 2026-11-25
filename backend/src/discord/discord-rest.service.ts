import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../core/config';
import type { BuiltMessage } from '../render/message-builder.service';
import { StatsService } from '../admin/stats.service';
import { RedisService } from '../redis/redis.service';
import { sha256Hex } from '../shared/crypto';

const API = new URL('https://discord.com/api/v10/');
const USER_AGENT = 'DiscordBot (https://dexbotx.app, 1.0.0)';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeRoute(path: string): string {
  return path.split('?')[0].replace(/\/\d{17,20}(?=\/|$)/g, '/:id');
}

export class DiscordApiError extends Error {
  constructor(
    readonly status: number,
    readonly discordCode: number | undefined,
    message: string,
    readonly retryAfter?: number,
  ) {
    super(message);
    this.name = 'DiscordApiError';
  }
}

export interface DiscordTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
}

export interface DiscordUser {
  id: string;
  username: string;
  global_name: string | null;
  avatar: string | null;
}

export interface DiscordUserGuild {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string;
}

export interface DiscordChannel {
  id: string;
  type: number;
  name: string;
  position: number;
  parent_id: string | null;
  permission_overwrites?: Array<{ id: string; type: number; allow: string; deny: string }>;
  guild_id?: string;
}

export interface DiscordGuild {
  id: string;
  name: string;
  icon: string | null;
  banner?: string | null;
  approximate_member_count?: number;
  owner_id?: string;
  system_channel_id?: string | null;
}

export interface DiscordRole {
  id: string;
  name: string;
  color: number;
  position: number;
  permissions?: string;
  hoist?: boolean;
  managed?: boolean;
  tags?: Record<string, unknown>;
}

const ROLES_CACHE_TTL_SECONDS = 300;
const MEMBER_CACHE_TTL_SECONDS = 60;
const GUILD_BOT_CACHE_TTL_SECONDS = 120;

@Injectable()
export class DiscordRestService {
  private readonly logger = new Logger(DiscordRestService.name);
  private readonly inflight = new Map<string, Promise<unknown>>();

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly stats: StatsService,
    private readonly redis: RedisService,
  ) {}

  private coalesce<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.inflight.get(key) as Promise<T> | undefined;
    if (existing) return existing;
    const promise = fn().finally(() => {
      if (this.inflight.get(key) === promise) this.inflight.delete(key);
    });
    this.inflight.set(key, promise);
    return promise;
  }

  private async request<T>(path: string, init: RequestInit, attempt = 0): Promise<T> {
    if (!path.startsWith('/') || path.startsWith('//')) {
      throw new Error('Invalid Discord API path');
    }
    const url = new URL(path.slice(1), API);
    if (url.origin !== API.origin || !url.pathname.startsWith(API.pathname)) {
      throw new Error('Invalid Discord API path');
    }

    const method = (init.method ?? 'GET').toUpperCase();
    await this.stats.recordDiscordRestCall(method, normalizeRoute(path));
    const res = await fetch(url, {
      ...init,
      headers: { 'User-Agent': USER_AGENT, ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(10_000),
    });
    await this.stats.incr('d_total');
    if ([401, 403, 404, 429].includes(res.status)) {
      await this.stats.incr(`d_${res.status}`);
    }

    if (res.status === 204) return undefined as T;
    const text = await res.text();
    let body: unknown;
    try {
      body = text ? JSON.parse(text) : undefined;
    } catch {
      /* non-JSON error body */
    }
    if (!res.ok) {
      const errorBody = isRecord(body) ? body : undefined;
      const retryAfterValue = errorBody?.retry_after;
      const retryAfterValueFromResponse = typeof retryAfterValue === 'number' || typeof retryAfterValue === 'string'
        ? Number(retryAfterValue)
        : Number(res.headers.get('retry-after') ?? 1);
      const retryAfter = res.status === 429
        ? Number.isFinite(retryAfterValueFromResponse) && retryAfterValueFromResponse >= 0
          ? retryAfterValueFromResponse
          : 1
        : undefined;
      if (res.status === 429 && retryAfter !== undefined) {
        const route = path.split('?')[0].replace(/\/\d{17,20}(?=\/|$)/g, '/:id');
        const scope = res.headers.get('x-ratelimit-scope');
        const global = (isRecord(body) && body.global === true) || scope === 'global';
        await this.stats.pushEvent('d429', {
          route,
          scope,
          retryAfter,
          global,
          at: new Date().toISOString(),
        });
        try {
          const ttlSeconds = Math.max(1, Math.ceil(retryAfter));
          const expiresAt = String(Date.now() + ttlSeconds * 1000);
          if (global) {
            await this.redis.client.set('discord:blocked_until', expiresAt, 'EX', ttlSeconds);
          } else {
            const authorization = new Headers(init.headers).get('authorization') ?? '';
            const userTokenKey = /^Bearer\s/i.test(authorization)
              ? `discord:blocked:user:${sha256Hex(authorization)}`
              : undefined;
            const channelRoute = /^\/guilds\/(\d{17,20})\/channels(?:\?|$)/.exec(path);
            const scopedKey = userTokenKey
              ?? (channelRoute ? `discord:blocked:channels:${channelRoute[1]}` : undefined);
            if (scopedKey) await this.redis.client.set(scopedKey, expiresAt, 'EX', ttlSeconds);
          }
        } catch (error) {
          this.logger.warn(`Discord cooldown write failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      const discordCode = typeof errorBody?.code === 'number' ? errorBody.code : undefined;
      const message = typeof errorBody?.message === 'string' ? errorBody.message : `Discord API error ${res.status}`;
      const oldMessageEditLimit = res.status === 429
        && message.toLowerCase().includes('maximum number of edits to messages older than 1 hour reached');
      if (!oldMessageEditLimit
        && res.status === 429
        && retryAfter !== undefined
        && retryAfter <= 3
        && attempt < 2
        && (method === 'GET' || method === 'PUT' || method === 'PATCH' || method === 'POST')) {
        const waitMs = Math.max(250, Math.ceil(retryAfter * 1000) + 100);
        this.logger.warn(`Discord 429 on ${method} ${normalizeRoute(path)}; retrying in ${waitMs}ms (attempt ${attempt + 1})`);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        return this.request<T>(path, init, attempt + 1);
      }
      throw new DiscordApiError(res.status, discordCode, message, retryAfter);
    }
    return body as T;
  }

  private bot(): Record<string, string> {
    return { Authorization: `Bot ${this.config.discordBotToken}` };
  }

  // ---- OAuth2 (user) ----

  exchangeCode(code: string): Promise<DiscordTokenResponse> {
    return this.request<DiscordTokenResponse>('/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.config.discordClientId,
        client_secret: this.config.discordClientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.config.redirectUri,
      }),
    });
  }

  async revokeToken(token: string): Promise<void> {
    await this.request<void>('/oauth2/token/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.config.discordClientId,
        client_secret: this.config.discordClientSecret,
        token,
        token_type_hint: 'access_token',
      }),
    });
  }

  getCurrentUser(accessToken: string): Promise<DiscordUser> {
    return this.request<DiscordUser>('/users/@me', { headers: { Authorization: `Bearer ${accessToken}` } });
  }

  /** The user's servers, following pagination (200 per page, capped at 1000). */
  async getCurrentUserGuilds(accessToken: string): Promise<DiscordUserGuild[]> {
    const all: DiscordUserGuild[] = [];
    let after: string | undefined;
    for (let page = 0; page < 5; page++) {
      const qs = new URLSearchParams({ limit: '200' });
      if (after) qs.set('after', after);
      const batch = await this.request<DiscordUserGuild[]>(`/users/@me/guilds?${qs}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      all.push(...batch);
      if (batch.length < 200) break;
      after = batch[batch.length - 1].id;
    }
    return all;
  }

  // ---- Bot REST ----

  async getGuildChannels(guildId: string): Promise<DiscordChannel[]> {
    const key = `discord:cache:channels:${guildId}`;
    const cached = await this.redis.client.get(key);
    if (cached) return JSON.parse(cached) as DiscordChannel[];

    return this.coalesce(key, async () => {
      const [blockedUntil, routeBlockedUntil] = await Promise.all([
        this.redis.client.get('discord:blocked_until'),
        this.redis.client.get(`discord:blocked:channels:${guildId}`),
      ]);
      const now = Date.now();
      const blocked = Math.max(Number(blockedUntil ?? 0), Number(routeBlockedUntil ?? 0));
      if (blocked > now) {
        throw new DiscordApiError(
          429,
          undefined,
          'Discord is temporarily rate limited and no cached channels are available.',
          Math.ceil((blocked - now) / 1000),
        );
      }

      const channels = await this.request<DiscordChannel[]>(`/guilds/${guildId}/channels`, { headers: this.bot() });
      try {
        await this.redis.client.set(key, JSON.stringify(channels), 'EX', 60 * 60);
      } catch (error) {
        this.logger.warn(`Discord channel cache write failed: ${error instanceof Error ? error.message : String(error)}`);
      }
      return channels;
    });
  }

  async canBotPost(channelId: string, includeEmbed = false): Promise<boolean> {
    const channel = await this.request<DiscordChannel>(`/channels/${channelId}`, { headers: this.bot() });
    if (!channel.guild_id) return false;
    const overwrites = channel.permission_overwrites ?? [];
    const required = (1n << 10n) | (1n << 11n) | (includeEmbed ? 1n << 14n : 0n);
    const applyOverwrite = (permissions: bigint, overwrite: { allow: string; deny: string }) =>
      (permissions & ~BigInt(overwrite.deny)) | BigInt(overwrite.allow);
    const overwriteOnlyCheck = (): boolean => {
      let permissions = required;
      const everyoneOverwrite = overwrites.find((overwrite) => overwrite.type === 0 && overwrite.id === channel.guild_id);
      if (everyoneOverwrite) permissions = applyOverwrite(permissions, everyoneOverwrite);
      const memberOverwrite = overwrites.find((overwrite) => overwrite.type === 1 && overwrite.id === this.config.discordClientId);
      if (memberOverwrite) permissions = applyOverwrite(permissions, memberOverwrite);
      return (permissions & required) === required;
    };

    let roles: DiscordRole[];
    let member: { roles: string[] };
    try {
      [roles, member] = await Promise.all([
        this.getGuildRoles(channel.guild_id),
        this.getGuildMember(channel.guild_id, this.config.discordClientId),
      ]);
    } catch (error) {
      this.logger.warn(`Could not load bot roles for channel ${channelId}; using overwrite-only permission check: ${error instanceof Error ? error.message : String(error)}`);
      return overwriteOnlyCheck();
    }

    if (roles.some((role) => typeof role.permissions !== 'string')) return overwriteOnlyCheck();
    const memberRoleIds = new Set(member.roles);
    let permissions = 0n;
    for (const role of roles) {
      if (role.id === channel.guild_id || memberRoleIds.has(role.id)) {
        permissions |= BigInt(role.permissions ?? '0');
      }
    }
    if ((permissions & (1n << 3n)) !== 0n) return true;

    const everyoneOverwrite = overwrites.find((overwrite) => overwrite.type === 0 && overwrite.id === channel.guild_id);
    if (everyoneOverwrite) permissions = applyOverwrite(permissions, everyoneOverwrite);

    const roleOverwrites = overwrites.filter((overwrite) => overwrite.type === 0 && memberRoleIds.has(overwrite.id));
    const roleAllow = roleOverwrites.reduce((bits, overwrite) => bits | BigInt(overwrite.allow), 0n);
    const roleDeny = roleOverwrites.reduce((bits, overwrite) => bits | BigInt(overwrite.deny), 0n);
    permissions = (permissions & ~roleDeny) | roleAllow;

    const memberOverwrite = overwrites.find((overwrite) => overwrite.type === 1 && overwrite.id === this.config.discordClientId);
    if (memberOverwrite) permissions = applyOverwrite(permissions, memberOverwrite);
    return (permissions & required) === required;
  }

  async leaveGuild(guildId: string): Promise<void> {
    await this.request<void>(`/users/@me/guilds/${guildId}`, { method: 'DELETE', headers: this.bot() });
  }

  async getGuildRoles(guildId: string): Promise<DiscordRole[]> {
    const key = `discord:cache:roles:${guildId}`;
    const cached = await this.redis.client.get(key).catch(() => null);
    if (cached) return JSON.parse(cached) as DiscordRole[];
    return this.coalesce(key, async () => {
      const roles = await this.request<DiscordRole[]>(`/guilds/${guildId}/roles`, { headers: this.bot() });
      await this.redis.client.set(key, JSON.stringify(roles), 'EX', ROLES_CACHE_TTL_SECONDS).catch(() => undefined);
      return roles;
    });
  }

  async createRole(guildId: string, name: string, permissions: string, color = 0, hoist = false): Promise<DiscordRole> {
    const role = await this.request<DiscordRole>(`/guilds/${guildId}/roles`, {
      method: 'POST',
      headers: { ...this.bot(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, permissions, color, mentionable: false, hoist }),
    });
    await this.redis.client.del(`discord:cache:roles:${guildId}`).catch(() => undefined);
    return role;
  }

  async modifyRole(guildId: string, roleId: string, body: { hoist: boolean }): Promise<DiscordRole> {
    const role = await this.request<DiscordRole>(`/guilds/${guildId}/roles/${roleId}`, {
      method: 'PATCH',
      headers: { ...this.bot(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    await this.redis.client.del(`discord:cache:roles:${guildId}`).catch(() => undefined);
    return role;
  }

  async getGuildMember(guildId: string, userId: string): Promise<{ roles: string[] }> {
    const key = `discord:cache:member:${guildId}:${userId}`;
    const cached = await this.redis.client.get(key).catch(() => null);
    if (cached) return JSON.parse(cached) as { roles: string[] };
    return this.coalesce(key, async () => {
      const member = await this.request<{ roles: string[] }>(`/guilds/${guildId}/members/${userId}`, { headers: this.bot() });
      await this.redis.client.set(key, JSON.stringify(member), 'EX', MEMBER_CACHE_TTL_SECONDS).catch(() => undefined);
      return member;
    });
  }

  async addMemberRole(guildId: string, userId: string, roleId: string, reason?: string): Promise<void> {
    await this.request<void>(`/guilds/${guildId}/members/${userId}/roles/${roleId}`, {
      method: 'PUT',
      headers: { ...this.bot(), ...(reason ? { 'X-Audit-Log-Reason': encodeURIComponent(reason) } : {}) },
    });
    await this.redis.client.del(`discord:cache:member:${guildId}:${userId}`).catch(() => undefined);
  }

  async setChannelOverwrite(channelId: string, targetId: string, allow: string): Promise<void> {
    await this.request<void>(`/channels/${channelId}/permissions/${targetId}`, {
      method: 'PUT',
      headers: { ...this.bot(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 0, allow, deny: '0' }),
    });
  }

  /** Succeeds only if the bot is in the guild; Discord returns 404/403 otherwise. */
  async getGuildAsBot(guildId: string): Promise<DiscordGuild> {
    const key = `discord:cache:guild-bot:${guildId}`;
    const cached = await this.redis.client.get(key).catch(() => null);
    if (cached) return JSON.parse(cached) as DiscordGuild;
    return this.coalesce(key, async () => {
      const guild = await this.request<DiscordGuild>(`/guilds/${guildId}?with_counts=true`, { headers: this.bot() });
      await this.redis.client.set(key, JSON.stringify(guild), 'EX', GUILD_BOT_CACHE_TTL_SECONDS).catch(() => undefined);
      return guild;
    });
  }

  async createDmChannel(userId: string): Promise<{ id: string }> {
    return this.request<{ id: string }>('/users/@me/channels', {
      method: 'POST',
      headers: { ...this.bot(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient_id: userId }),
    });
  }

  async createGuildChannel(guildId: string, body: Record<string, unknown>): Promise<DiscordChannel> {
    const created = await this.request<DiscordChannel>(`/guilds/${guildId}/channels`, {
      method: 'POST',
      headers: { ...this.bot(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    await this.redis.client.del(`discord:cache:channels:${guildId}`).catch(() => undefined);
    return created;
  }

  async editGuildChannel(channelId: string, body: Record<string, unknown>): Promise<DiscordChannel> {
    return this.request<DiscordChannel>(`/channels/${channelId}`, {
      method: 'PATCH',
      headers: { ...this.bot(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  async getChannelMessage(channelId: string, messageId: string): Promise<{ id: string }> {
    return this.request<{ id: string }>(`/channels/${channelId}/messages/${messageId}`, {
      headers: this.bot(),
    });
  }

  async deleteChannelMessage(channelId: string, messageId: string): Promise<void> {
    await this.request<void>(`/channels/${channelId}/messages/${messageId}`, {
      method: 'DELETE',
      headers: this.bot(),
    });
  }

  async deleteGuildChannel(channelId: string): Promise<void> {
    await this.request<void>(`/channels/${channelId}`, {
      method: 'DELETE',
      headers: this.bot(),
    });
  }

  async createChannelMessage(channelId: string, payload: Record<string, unknown>): Promise<{ id: string }> {
    return this.request<{ id: string }>(`/channels/${channelId}/messages`, {
      method: 'POST',
      headers: { ...this.bot(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, allowed_mentions: payload.allowed_mentions ?? { parse: [] } }),
    });
  }

  async editChannelMessage(channelId: string, messageId: string, payload: Record<string, unknown>): Promise<void> {
    await this.request<void>(`/channels/${channelId}/messages/${messageId}`, {
      method: 'PATCH',
      headers: { ...this.bot(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, allowed_mentions: { parse: [] } }),
    });
  }

  async pinChannelMessage(channelId: string, messageId: string): Promise<void> {
    await this.request<void>(`/channels/${channelId}/pins/${messageId}`, {
      method: 'PUT',
      headers: this.bot(),
    });
  }

  async createMessage(
    channelId: string,
    message: BuiltMessage,
    mentions: string[] | { users: string[] } = [],
  ): Promise<void> {
    const users = Array.isArray(mentions) ? mentions : mentions.users;
    const payload = {
      content: message.content,
      embeds: message.embeds,
      allowed_mentions: { parse: [], users },
      ...(message.file ? { attachments: [{ id: 0, filename: message.file.name }] } : {}),
    };
    if (!message.file) {
      await this.request<void>(`/channels/${channelId}/messages`, {
        method: 'POST',
        headers: { ...this.bot(), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return;
    }
    const form = new FormData();
    form.set('payload_json', JSON.stringify(payload));
    form.set('files[0]', new Blob([new Uint8Array(message.file.data)], { type: 'image/png' }), message.file.name);
    await this.request<void>(`/channels/${channelId}/messages`, { method: 'POST', headers: this.bot(), body: form });
  }
}
