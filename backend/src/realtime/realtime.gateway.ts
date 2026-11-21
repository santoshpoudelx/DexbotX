import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { OnGatewayConnection, OnGatewayDisconnect, WebSocketGateway } from '@nestjs/websockets';
import type { IncomingMessage } from 'node:http';
import type { RawData, WebSocket } from 'ws';
import type { SessionData } from '../common/types';
import { SESSION_REVOKED_CHANNEL, SessionService } from '../auth/session.service';
import { APP_CONFIG, AppConfig } from '../core/config';
import { RedisService } from '../redis/redis.service';
import { GuildsService } from '../guilds/guilds.service';

type RoomMessage =
  | { type: 'join'; guildId: string }
  | { type: 'leave'; guildId: string };

type ClientSocket = WebSocket & {
  userId?: string;
  session?: SessionData;
  rooms?: Set<string>;
};

interface GuildEvent {
  type: string;
  guildId: string;
  kind: 'channels' | 'roles' | 'installed' | 'settings';
  data: Record<string, string>;
  rev: number;
}

@Injectable()
@WebSocketGateway({ path: '/ws', maxPayload: 8192, perMessageDeflate: false })
export class RealtimeGateway implements OnModuleInit, OnApplicationShutdown, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);
  private readonly rooms = new Map<string, Set<ClientSocket>>();
  private readonly userSockets = new Map<string, Set<ClientSocket>>();
  private readonly alive = new WeakMap<ClientSocket, boolean>();
  private pingTimer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly redis: RedisService,
    private readonly sessions: SessionService,
    private readonly guilds: GuildsService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.redis.psubscribe('guild:*:events', (channel, message) => this.forwardEvent(channel, message));
    await this.redis.subscribe(SESSION_REVOKED_CHANNEL, (_channel, userId) => this.closeUserSockets(userId));

    this.pingTimer = setInterval(() => this.pingClients(), 25_000);
    this.pingTimer.unref();
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.pingTimer) clearInterval(this.pingTimer);
    for (const sockets of this.userSockets.values()) {
      for (const socket of sockets) socket.close(1001, 'Server shutting down');
    }
    this.rooms.clear();
    this.userSockets.clear();
  }

  async handleConnection(socket: ClientSocket, request: IncomingMessage): Promise<void> {
    const origin = request.headers.origin;
    const requestUrl = new URL(request.url ?? '/', 'http://localhost');
    const ticket = requestUrl.searchParams.get('ticket');
    if (!origin || !this.config.allowedWebOrigins.includes(origin) || !ticket || !/^[A-Za-z0-9_-]{43}$/.test(ticket)) {
      socket.close(4401, 'Unauthorized');
      return;
    }

    try {
      const ticketValue = await this.redis.client.getdel(`wsticket:${ticket}`);
      if (!ticketValue) {
        socket.close(4401, 'Unauthorized');
        return;
      }

      const ticketData = parseTicket(ticketValue);
      if (!ticketData) {
        socket.close(4401, 'Unauthorized');
        return;
      }
      const userId = ticketData.userId;
      const session = ticketData.sid
        ? await this.sessions.get(ticketData.sid)
        : await this.sessions.findActiveForUser(userId);
      if (!session || session.userId !== userId || !Number.isFinite(session.expiresAt) || session.expiresAt <= Date.now()) {
        socket.close(4401, 'Unauthorized');
        return;
      }

      const sockets = this.userSockets.get(userId) ?? new Set<ClientSocket>();
      if (sockets.size >= 5) {
        socket.close(4429, 'Connection limit reached');
        return;
      }

      socket.userId = userId;
      socket.session = session;
      socket.rooms = new Set();
      this.userSockets.set(userId, sockets.add(socket));
      this.alive.set(socket, true);
      socket.on('pong', () => this.alive.set(socket, true));
      socket.on('message', (data) => void this.handleMessage(socket, data));
    } catch (error) {
      this.logger.error(`WebSocket authentication failed: ${error instanceof Error ? error.message : String(error)}`);
      socket.close(1011, 'Connection authentication failed');
    }
  }

  handleDisconnect(socket: ClientSocket): void {
    this.removeSocket(socket);
  }

  private async handleMessage(socket: ClientSocket, raw: RawData): Promise<void> {
    if (!socket.userId || !socket.session || !socket.rooms) return;

    let message: unknown;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      this.send(socket, { type: 'error', code: 'invalid_message' });
      return;
    }
    if (!isRoomMessage(message)) {
      this.send(socket, { type: 'error', code: 'invalid_message' });
      return;
    }

    if (message.type === 'leave') {
      this.leaveRoom(socket, message.guildId);
      return;
    }
    if (!Number.isFinite(socket.session.expiresAt) || socket.session.expiresAt <= Date.now()) {
      socket.close(4401, 'Session ended');
      return;
    }

    try {
      await this.guilds.authorizeInstalledGuild(socket.session, message.guildId);
      const room = this.rooms.get(message.guildId) ?? new Set<ClientSocket>();
      room.add(socket);
      this.rooms.set(message.guildId, room);
      socket.rooms.add(message.guildId);
      const revision = Number(await this.redis.client.get(`guild:${message.guildId}:rev`) ?? 0);
      this.send(socket, { type: 'joined', guildId: message.guildId, rev: Number.isSafeInteger(revision) ? revision : 0 });
    } catch (error) {
      const code = error instanceof ForbiddenException ? 'forbidden' : 'unavailable';
      this.send(socket, { type: 'error', code, guildId: message.guildId });
    }
  }

  private leaveRoom(socket: ClientSocket, guildId: string): void {
    socket.rooms?.delete(guildId);
    const room = this.rooms.get(guildId);
    room?.delete(socket);
    if (room?.size === 0) this.rooms.delete(guildId);
    this.send(socket, { type: 'left', guildId });
  }

  private forwardEvent(channel: string, raw: string): void {
    const match = /^guild:(\d{17,20}):events$/.exec(channel);
    if (!match) return;
    const event = parseGuildEvent(raw, match[1]);
    if (!event) return;

    const payload = JSON.stringify(event);
    for (const socket of this.rooms.get(event.guildId) ?? []) {
      if (socket.readyState === socket.OPEN) socket.send(payload);
    }
  }

  private pingClients(): void {
    for (const sockets of this.userSockets.values()) {
      for (const socket of sockets) {
        if (socket.session && (!Number.isFinite(socket.session.expiresAt) || socket.session.expiresAt <= Date.now())) {
          socket.close(4401, 'Session ended');
          continue;
        }
        if (this.alive.get(socket) === false) {
          socket.terminate();
          continue;
        }
        this.alive.set(socket, false);
        socket.ping();
      }
    }
  }

  private closeUserSockets(userId: string): void {
    for (const socket of this.userSockets.get(userId) ?? []) {
      socket.close(4401, 'Session ended');
    }
  }

  private removeSocket(socket: ClientSocket): void {
    for (const guildId of socket.rooms ?? []) {
      const room = this.rooms.get(guildId);
      room?.delete(socket);
      if (room?.size === 0) this.rooms.delete(guildId);
    }
    if (socket.userId) {
      const sockets = this.userSockets.get(socket.userId);
      sockets?.delete(socket);
      if (sockets?.size === 0) this.userSockets.delete(socket.userId);
    }
    socket.rooms?.clear();
  }

  private send(socket: ClientSocket, payload: unknown): void {
    if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(payload));
  }
}

function parseTicket(value: string): { userId: string; sid?: string } | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      typeof parsed === 'object'
      && parsed !== null
    ) {
      const ticket = parsed as Record<string, unknown>;
      if (typeof ticket.userId !== 'string' || (ticket.sid !== undefined && typeof ticket.sid !== 'string')) return null;
      return {
        userId: ticket.userId,
        ...(typeof ticket.sid === 'string' ? { sid: ticket.sid } : {}),
      };
    }
  } catch {
    if (value) return { userId: value };
  }
  return value ? { userId: value } : null;
}

function isRoomMessage(value: unknown): value is RoomMessage {
  if (!value || typeof value !== 'object') return false;
  const message = value as Record<string, unknown>;
  return (message.type === 'join' || message.type === 'leave')
    && typeof message.guildId === 'string'
    && /^\d{17,20}$/.test(message.guildId);
}

function parseGuildEvent(raw: string, guildId: string): GuildEvent | null {
  try {
    const event: unknown = JSON.parse(raw);
    if (!event || typeof event !== 'object') return null;
    const value = event as Record<string, unknown>;
    if (value.guildId !== guildId || typeof value.type !== 'string') return null;
    if (value.kind !== 'channels' && value.kind !== 'roles' && value.kind !== 'installed' && value.kind !== 'settings') return null;
    if (!value.data || typeof value.data !== 'object' || Array.isArray(value.data)) return null;
    const data = value.data as Record<string, unknown>;
    const idKey = value.kind === 'channels' ? 'channelId' : value.kind === 'roles' ? 'roleId' : null;
    if (idKey && (typeof data[idKey] !== 'string' || !/^\d{17,20}$/.test(data[idKey] as string))) return null;
    if (typeof value.rev !== 'number' || !Number.isSafeInteger(value.rev) || value.rev < 0) return null;
    return {
      type: value.type,
      guildId,
      kind: value.kind,
      data: idKey ? { [idKey]: data[idKey] as string } : {},
      rev: value.rev,
    };
  } catch {
    return null;
  }
}
