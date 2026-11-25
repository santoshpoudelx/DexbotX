/** Mirrors the backend's API contract (backend/src/shared/message-config.ts and the controllers). */
export type MessageKind = 'welcome' | 'goodbye';
export const MESSAGE_KINDS: readonly MessageKind[] = ['welcome', 'goodbye'];

export type ImageStyleId = 'midnight' | 'sunset' | 'aurora' | 'neon' | 'ocean' | 'minimal';

export interface EmbedConfig {
  enabled: boolean;
  title: string;
  description: string;
  color: string;
  footer: string;
}

export interface ImageConfig {
  enabled: boolean;
  style: ImageStyleId;
  title: string;
  subtitle: string;
  accentColor: string;
  useServerBanner: boolean;
  avatarShape: 'circle' | 'rounded';
  showMemberCount: boolean;
  /** Uploaded background in private storage ("<guildId>/<sha256>.jpg"). Overrides the server banner. */
  backgroundPath: string | null;
}

export interface MessageContent {
  content: string;
  embed: EmbedConfig;
  image: ImageConfig;
}

export interface MessageConfig extends MessageContent {
  enabled: boolean;
  channelId: string | null;
}

export interface Me {
  id: string;
  username: string;
  globalName: string | null;
  avatarUrl: string;
  isAdmin: boolean;
}

export interface GuildSummary {
  id: string;
  name: string;
  iconUrl: string | null;
  owner: boolean;
  botInstalled: boolean;
  inviteUrl: string | null;
}

export interface GuildDetail {
  id: string;
  name: string;
  iconUrl: string | null;
  bannerUrl: string | null;
  memberCount: number;
  lastSyncedAt: string | null;
}

export interface GuildSettings {
  welcome: MessageConfig;
  goodbye: MessageConfig;
  autoRoles?: AutoRoleConfig;
}

export interface AutoRoleConfig {
  enabled: boolean;
  roleIds: string[];
  delaySeconds: number;
  skipBots: boolean;
  waitForScreening: boolean;
  announce: {
    enabled: boolean;
    channelId: string | null;
    message: string;
    embed: EmbedConfig;
  };
}

export interface AutoRoleResponse {
  config: AutoRoleConfig;
  roles: {
    assignable: GuildRole[];
    hidden: Array<{ id: string; name: string; reason: string }>;
  };
  checks: {
    hasManageRoles: boolean;
    roleBelowBot: boolean;
    canSendInChannel: boolean;
  };
  canTest: boolean;
}

export interface AutoRoleActivity {
  id: number;
  guildId: string;
  userId: string;
  roleId: string;
  outcome: 'assigned' | 'skipped_left' | 'skipped_has_role' | 'skipped_unsafe' | 'failed' | 'enqueue_failed' | 'skipped_pending';
  delaySeconds: number | null;
  createdAt: string;
}

export interface SavedMessage {
  config: MessageConfig;
  imageKey: string | null;
}

export interface Channel {
  id: string;
  name: string;
  category: string | null;
}

export interface GuildRole {
  id: string;
  name: string;
  color: number;
  position: number;
}

export interface GuildRefreshResult {
  guild: { id: string; name: string; icon: string | null; ownerId: string | null; memberCount: number };
  channels: Channel[];
  roles: GuildRole[];
  lastSyncedAt: string;
}

export interface Preset {
  id: string;
  name: string;
  description: string;
  kind: MessageKind;
  config: MessageContent;
}

export interface EconomySettings {
  currencyName: string;
  economyName: string;
  dailyAmount: number;
  streakStep: number;
  streakCapDays: number;
  dailyBoostBonus: number;
  stealAmount: number;
  minSteal: number;
  protectionThreshold: number;
  weeklyGiftSendLimit: number;
  weeklyGiftReceiveLimit: number;
  minAccountAgeDays: number;
  minServerHours: number;
  bountyMin: number;
  bountyMax: number;
  commandCooldownSeconds: number;
  timezone: string;
  heistAnnounceChannelId: string | null;
  pingVictim: boolean;
  mirrorHeistsToAnnouncements: boolean;
  announcementEvents: {
    gifts: boolean;
    rolePurchases: boolean;
    customTitles: boolean;
    streakMilestones: boolean;
  };
}

export interface EconomyState {
  enabled: boolean;
  paused: boolean;
  channels: Record<string, string | null>;
  missing: string[];
  walletCount: number;
}

export interface EconomyItem {
  id: number;
  guildId: string;
  itemId: string;
  kind: string;
  name: string;
  description: string;
  price: number;
  roleId: string | null;
  stock: number | null;
  enabled: boolean;
  isDefault: boolean;
  sortOrder: number;
}

export interface EconomySafeRole {
  id: string;
  name: string;
  color: number;
  position: number;
  reason: string | null;
}

export interface ApiErrorBody {
  statusCode: number;
  message: string;
  issues?: Array<{ path: string; message: string }>;
}
