import { z } from 'zod';

export const MAX_AUTO_ROLES = 1;
export const AUTO_ROLE_MAX_DELAY_SECONDS = 30;
export const AUTO_ROLE_SLOT_SPACING_MS = 1000;

const DEFAULT_AUTO_ROLE_MESSAGE = 'Congratulations {user} You unlocked new {role} role.';
const DEFAULT_AUTO_ROLE_EMBED = {
  enabled: false,
  title: 'Role assigned {role}',
  description: 'Enjoy your new permissions and privileges! ✨',
  color: '#7c6cff',
  footer: 'Enjoy your new role! 💜',
};

export const defaultAutoRoleConfig = (): AutoRoleConfig => ({
  enabled: false,
  roleIds: [],
  delaySeconds: 3,
  skipBots: true,
  waitForScreening: true,
  announce: {
    enabled: false,
    channelId: null,
    message: DEFAULT_AUTO_ROLE_MESSAGE,
    embed: { ...DEFAULT_AUTO_ROLE_EMBED },
  },
});

export interface AutoRoleBotStatus {
  highestPosition: number;
  highestRoleId: string | null;
  manageRoles: boolean;
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
    embed: {
      enabled: boolean;
      title: string;
      description: string;
      color: string;
      footer: string;
    };
  };
}

const variablePattern = /\{([^{}]*)\}/g;
const allowedVariables = new Set(['user', 'username', 'role', 'server', 'memberCount']);

export const autoRoleConfigSchema = z.object({
  enabled: z.boolean(),
  roleIds: z.array(z.string().regex(/^\d{17,20}$/)).max(MAX_AUTO_ROLES),
  delaySeconds: z.number().int().min(0).max(AUTO_ROLE_MAX_DELAY_SECONDS).default(3),
  skipBots: z.boolean(),
  waitForScreening: z.boolean(),
  announce: z.object({
    enabled: z.boolean(),
    channelId: z.string().regex(/^\d{17,20}$/).nullable(),
    message: z.string().max(300),
    embed: z.object({
      enabled: z.boolean(),
      title: z.string().max(256),
      description: z.string().max(2000),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      footer: z.string().max(200),
    }).strict().optional().default(DEFAULT_AUTO_ROLE_EMBED),
  }).strict(),
}).strict().superRefine((config, ctx) => {
  if (config.enabled && config.roleIds.length !== 1) {
    ctx.addIssue({ code: 'custom', path: ['roleIds'], message: 'Choose exactly one role' });
  }
  if (config.announce.enabled && !config.announce.channelId) {
    ctx.addIssue({ code: 'custom', path: ['announce', 'channelId'], message: 'Choose an announcement channel' });
  }
  validateAutoRoleTemplate(config.announce.message).issues.forEach((issue) => {
    ctx.addIssue({ code: 'custom', path: ['announce', 'message'], message: issue });
  });
  if (config.announce.embed.enabled && !config.announce.embed.title.trim() && !config.announce.embed.description.trim()) {
    ctx.addIssue({ code: 'custom', path: ['announce', 'embed', 'title'], message: 'An embed needs a title or a description' });
  }
});

export function clampAutoRoleDelay(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(AUTO_ROLE_MAX_DELAY_SECONDS, Math.floor(value)));
}

export function normalizeAutoRoleConfig(raw: unknown): AutoRoleConfig {
  const parsed = autoRoleConfigSchema.safeParse(raw);
  if (parsed.success) {
    const embed = parsed.data.announce.embed;
    return {
      ...parsed.data,
      delaySeconds: clampAutoRoleDelay(parsed.data.delaySeconds),
      waitForScreening: true,
      announce: {
        ...parsed.data.announce,
        embed: {
          ...embed,
          title: embed.title.trim() ? embed.title : DEFAULT_AUTO_ROLE_EMBED.title,
          description: embed.description.trim() ? embed.description : DEFAULT_AUTO_ROLE_EMBED.description,
          footer: embed.footer.trim() ? embed.footer : DEFAULT_AUTO_ROLE_EMBED.footer,
        },
      },
    };
  }

  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const announce = r.announce && typeof r.announce === 'object'
    ? r.announce as Record<string, unknown>
    : {};
  const embed = announce.embed && typeof announce.embed === 'object'
    ? announce.embed as Record<string, unknown>
    : {};
  const oldRoleIds = Array.isArray(r.roleIds) ? r.roleIds : [];
  const firstRole = oldRoleIds.find((id) => typeof id === 'string' && /^\d{17,20}$/.test(id));
  const legacyDelay = typeof r.delaySeconds === 'number'
    ? r.delaySeconds
    : r.delayMode === 'fixed'
      ? typeof r.fixedDelaySeconds === 'number' ? r.fixedDelaySeconds : 3
      : typeof r.minDelaySeconds === 'number'
        ? r.minDelaySeconds
        : typeof r.fixedDelaySeconds === 'number'
          ? r.fixedDelaySeconds
          : 3;

  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : false,
    roleIds: typeof firstRole === 'string' ? [firstRole] : [],
    delaySeconds: clampAutoRoleDelay(legacyDelay),
    skipBots: typeof r.skipBots === 'boolean' ? r.skipBots : true,
    waitForScreening: true,
    announce: {
      enabled: typeof announce.enabled === 'boolean' ? announce.enabled : false,
      channelId: typeof announce.channelId === 'string' && /^\d{17,20}$/.test(announce.channelId)
        ? announce.channelId
        : null,
      message: typeof announce.message === 'string'
        ? announce.message.slice(0, 300)
        : DEFAULT_AUTO_ROLE_MESSAGE,
      embed: {
        enabled: typeof embed.enabled === 'boolean' ? embed.enabled : DEFAULT_AUTO_ROLE_EMBED.enabled,
        title: typeof embed.title === 'string' && embed.title.trim() ? embed.title.slice(0, 256) : DEFAULT_AUTO_ROLE_EMBED.title,
        description: typeof embed.description === 'string' && embed.description.trim() ? embed.description.slice(0, 2000) : DEFAULT_AUTO_ROLE_EMBED.description,
        color: typeof embed.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(embed.color) ? embed.color : DEFAULT_AUTO_ROLE_EMBED.color,
        footer: typeof embed.footer === 'string' && embed.footer.trim() ? embed.footer.slice(0, 200) : DEFAULT_AUTO_ROLE_EMBED.footer,
      },
    },
  };
}

export function validateAutoRoleTemplate(message: string): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (message.length > 300) issues.push('Message must be 300 characters or fewer');
  const placeholders = [...message.matchAll(variablePattern)];
  const variables = placeholders.map((match) => match[1]);
  for (const variable of variables) {
    if (!allowedVariables.has(variable)) issues.push(`Unknown variable {${variable}}`);
  }
  const withoutPlaceholders = message.replace(variablePattern, '');
  if (/[{}]/.test(withoutPlaceholders)) issues.push('Template variables must use complete braces');
  return { valid: issues.length === 0, issues };
}

export function escapeDiscordMentions(text: string): string {
  return text.replace(/@(everyone|here)\b/gi, '@\u200b$1');
}

export function renderAutoRoleTemplate(
  template: string,
  values: AutoRoleTemplateValues,
): string {
  const mentionText = values.userMentions.length === 1
    ? values.userMentions[0]
    : values.userMentions.length > 1
      ? `${values.userMentions.slice(0, -1).join(', ')} and ${values.userMentions.at(-1)}`
      : '';
  return escapeDiscordMentions(template)
    .replace(/\{user\}/g, mentionText)
    .replace(/\{username\}/g, escapeDiscordMentions(values.username))
    .replace(/\{role\}/g, escapeDiscordMentions(values.roleName))
    .replace(/\{server\}/g, escapeDiscordMentions(values.serverName))
    .replace(/\{memberCount\}/g, String(values.memberCount));
}

export interface AutoRoleTemplateValues {
  username: string;
  roleName: string;
  serverName: string;
  memberCount: number;
  userMentions: string[];
}

export function renderAutoRoleEmbed(
  config: Pick<AutoRoleConfig['announce']['embed'], 'title' | 'description' | 'color' | 'footer'>,
  values: AutoRoleTemplateValues,
): { color: number; title?: string; description?: string; footer?: { text: string } } {
  const embed: { color: number; title?: string; description?: string; footer?: { text: string } } = {
    color: Number.parseInt(config.color.slice(1), 16),
  };
  const title = renderAutoRoleTemplate(config.title, values).slice(0, 256);
  const description = renderAutoRoleTemplate(config.description, values).slice(0, 2000);
  const footer = renderAutoRoleTemplate(config.footer, values).slice(0, 200);
  if (title) embed.title = title;
  if (description) embed.description = description;
  if (footer.trim()) embed.footer = { text: footer };
  return embed;
}

export interface AutoRoleDelayInput {
  delaySeconds?: number;
  nextFreeSlotSeconds: number;
}

export function computeAutoRoleDelay(input: AutoRoleDelayInput): number {
  const configured = clampAutoRoleDelay(input.delaySeconds ?? 3);
  return clampAutoRoleDelay(Math.max(configured, clampNonNegative(input.nextFreeSlotSeconds)));
}

export function secondsToMilliseconds(seconds: number): number {
  if (!Number.isFinite(seconds)) throw new Error('Delay must be a finite number of seconds');
  return Math.max(0, Math.ceil(seconds * 1000));
}

export function clampNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export interface AutoRoleSafetyRole {
  id: string;
  name: string;
  position: number;
  permissions: string;
  managed: boolean;
  tags: Record<string, unknown>;
}

export function compareAutoRoleHierarchy(
  first: Pick<AutoRoleSafetyRole, 'id' | 'position'>,
  second: Pick<AutoRoleSafetyRole, 'id' | 'position'>,
): number {
  if (first.position !== second.position) return first.position - second.position;

  const firstId = BigInt(first.id);
  const secondId = BigInt(second.id);
  if (firstId === secondId) return 0;
  return firstId < secondId ? 1 : -1;
}

export type AutoRoleSafetyReason =
  | 'bot or integration role'
  | 'everyone'
  | 'above the bot\'s role'
  | 'has admin or moderation permissions';

export function getAutoRoleSafetyReason(
  guildId: string,
  role: AutoRoleSafetyRole,
  botStatus: AutoRoleBotStatus,
): AutoRoleSafetyReason | null {
  if (role.id === guildId || role.name.toLowerCase() === '@everyone') return 'everyone';
  if (
    role.managed
    || role.tags?.bot_id
    || role.tags?.integration_id
    || role.tags?.premium_subscriber
    || role.tags?.guild_connections
    || role.tags?.is_linked_role
    || role.tags?.subscription_listing_id
  ) return 'bot or integration role';
  const aboveBot = botStatus.highestRoleId
    ? compareAutoRoleHierarchy(role, {
      id: botStatus.highestRoleId,
      position: botStatus.highestPosition,
    }) > 0
    : role.position >= botStatus.highestPosition;
  if (aboveBot) return 'above the bot\'s role';
  const danger =
    (1n << 1n) | (1n << 2n) | (1n << 3n) | (1n << 4n) | (1n << 5n)
    | (1n << 13n) | (1n << 17n) | (1n << 28n) | (1n << 40n);
  try {
    if ((BigInt(role.permissions || '0') & danger) !== 0n) return 'has admin or moderation permissions';
  } catch {
    return 'has admin or moderation permissions';
  }
  return null;
}
