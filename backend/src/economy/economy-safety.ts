import { type GuildMember, type Role } from 'discord.js';
import { compareAutoRoleHierarchy } from '../shared/auto-roles';

export interface EconomyRoleCandidate {
  id: string;
  name: string;
  position: number;
  permissions?: string;
  managed?: boolean;
  tags?: Record<string, unknown>;
}

/**
 * Returns true when a role is owned/managed by Discord, a bot, an integration,
 * Nitro boosts, or linked roles — and therefore cannot be assigned to members.
 */
export function isBotOrManagedRole(role: Pick<EconomyRoleCandidate, 'managed' | 'tags'>): boolean {
  const tags = role.tags;
  return Boolean(
    role.managed
    || tags?.bot_id
    || tags?.integration_id
    || tags?.premium_subscriber
    || tags?.guild_connections
    || tags?.is_linked_role
    || tags?.subscription_listing_id,
  );
}

/**
 * Validates whether a role can be sold in the Economy Store.
 * Unlike Auto Roles (which restricts to normal/non-privileged roles), the Economy Store
 * lets server admins sell any non-bot, non-managed role strictly below DexBotX's highest role
 * (including Manager/staff roles).
 */
export function roleSafetyReason(
  role: EconomyRoleCandidate,
  guildId: string,
  botHighestPosition: number,
  botHighestRoleId?: string | null,
): string | null {
  if (role.id === guildId || role.name.toLowerCase() === '@everyone') {
    return '@everyone cannot be sold.';
  }
  if (isBotOrManagedRole(role)) {
    return 'Bot and managed integration roles cannot be sold.';
  }
  const atOrAboveBot = botHighestRoleId
    ? compareAutoRoleHierarchy(role, { id: botHighestRoleId, position: botHighestPosition }) >= 0
    : role.position >= botHighestPosition;
  if (atOrAboveBot) {
    return 'This role is at or above DexBotX’s highest role.';
  }
  return null;
}

export function discordRoleSafetyReason(role: Role, botMember: GuildMember): string | null {
  return roleSafetyReason(
    {
      id: role.id,
      name: role.name,
      position: role.position,
      permissions: role.permissions.bitfield.toString(),
      managed: role.managed,
      tags: role.tags ? { ...role.tags } : undefined,
    },
    role.guild.id,
    botMember.roles.highest.position,
    botMember.roles.highest.id,
  );
}
