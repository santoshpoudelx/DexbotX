import { PermissionFlagsBits, type GuildMember, type Role } from 'discord.js';

export const DANGEROUS_ECONOMY_ROLE_PERMISSIONS = [
  ['Administrator', PermissionFlagsBits.Administrator],
  ['Manage Server', PermissionFlagsBits.ManageGuild],
  ['Manage Roles', PermissionFlagsBits.ManageRoles],
  ['Manage Channels', PermissionFlagsBits.ManageChannels],
  ['Manage Webhooks', PermissionFlagsBits.ManageWebhooks],
  ['Ban Members', PermissionFlagsBits.BanMembers],
  ['Kick Members', PermissionFlagsBits.KickMembers],
  ['Moderate Members', PermissionFlagsBits.ModerateMembers],
  ['Manage Messages', PermissionFlagsBits.ManageMessages],
  ['Mention Everyone', PermissionFlagsBits.MentionEveryone],
] as const;

export function roleSafetyReason(role: { id: string; name: string; position: number; permissions?: string; managed?: boolean }, guildId: string, botHighestPosition: number): string | null {
  if (role.id === guildId) return '@everyone cannot be sold.';
  if (role.managed) return 'Managed integration roles cannot be sold.';
  if (role.position >= botHighestPosition) return 'This role is at or above DexBotX’s highest role.';
  const permissions = BigInt(role.permissions ?? '0');
  const dangerous = DANGEROUS_ECONOMY_ROLE_PERMISSIONS.find(([, flag]) => (permissions & BigInt(flag)) !== 0n);
  return dangerous ? `${dangerous[0]} is not allowed on roles sold in the economy.` : null;
}

export function discordRoleSafetyReason(role: Role, botMember: GuildMember): string | null {
  if (role.id === role.guild.id) return '@everyone cannot be sold.';
  if (role.managed) return 'Managed integration roles cannot be sold.';
  if (role.position >= botMember.roles.highest.position) return 'This role is at or above DexBotX’s highest role.';
  const dangerous = DANGEROUS_ECONOMY_ROLE_PERMISSIONS.find(([, flag]) => (role.permissions.bitfield & BigInt(flag)) !== 0n);
  return dangerous ? `${dangerous[0]} is not allowed on roles sold in the economy.` : null;
}
