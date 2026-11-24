import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { createHash } from 'node:crypto';
import { moderationCommands } from '../src/bot/commands';

async function main(): Promise<void> {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!clientId || !/^\d{17,20}$/.test(clientId)) {
    throw new Error('DISCORD_CLIENT_ID must be set to a valid Discord application ID.');
  }
  if (!token) throw new Error('DISCORD_BOT_TOKEN must be set.');

  const args = process.argv.slice(2);
  const guildArgIndex = args.indexOf('--guild');
  const guildId = guildArgIndex >= 0 ? args[guildArgIndex + 1] : undefined;
  if (guildArgIndex >= 0 && (!guildId || !/^\d{17,20}$/.test(guildId))) {
    throw new Error('--guild must be followed by a valid Discord server ID.');
  }

  const rest = new REST({ version: '10' }).setToken(token);
  const route = guildId
    ? Routes.applicationGuildCommands(clientId, guildId)
    : Routes.applicationCommands(clientId);
  const desired = moderationCommands.map((command) => command.toJSON());
  const projection = (command: unknown): unknown => {
    if (!command || typeof command !== 'object') return command;
    const value = command as Record<string, unknown>;
    return {
      name: value.name,
      description: value.description,
      type: value.type,
      required: value.required,
      autocomplete: value.autocomplete,
      min_value: value.min_value,
      max_value: value.max_value,
      min_length: value.min_length,
      max_length: value.max_length,
      channel_types: value.channel_types,
      choices: value.choices,
      contexts: value.contexts,
      dm_permission: value.dm_permission,
      default_member_permissions: value.default_member_permissions,
      options: Array.isArray(value.options)
        ? value.options.map((option) => projection(option))
        : undefined,
    };
  };
  const hash = (commands: unknown[]) => createHash('sha256')
    .update(JSON.stringify(commands.map(projection)))
    .digest('hex');
  const existing = await rest.get(route) as unknown[];
  if (hash(existing) === hash(desired)) {
    console.log(`No command changes; skipped overwrite for ${desired.length} bot commands${guildId ? ` in guild ${guildId}` : ' globally'}.`);
    return;
  }
  await rest.put(route, { body: desired });
  console.log(`Registered ${desired.length} bot commands${guildId ? ` for guild ${guildId}` : ' globally'}.`);
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown command registration failure';
  console.error(`Command registration failed: ${message}`);
  process.exitCode = 1;
});
