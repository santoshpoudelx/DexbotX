import { InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

export const rewardCommand = new SlashCommandBuilder().setName('reward').setDescription('Claim your daily Dex reward').setContexts(InteractionContextType.Guild);
export const balanceCommand = new SlashCommandBuilder().setName('balance').setDescription('View your Dex balance').setContexts(InteractionContextType.Guild);
export const shopCommand = new SlashCommandBuilder().setName('shop').setDescription('View the Dex Economy store').setContexts(InteractionContextType.Guild);
export const storeCommand = new SlashCommandBuilder().setName('store').setDescription('View the Dex Economy store').setContexts(InteractionContextType.Guild);
export const buyCommand = new SlashCommandBuilder().setName('buy').setDescription('Buy an economy item').setContexts(InteractionContextType.Guild)
  .addStringOption((option) => option.setName('item').setDescription('Item name').setRequired(true).setAutocomplete(true));
export const giftCommand = new SlashCommandBuilder().setName('gift').setDescription('Gift Dex to another member').setContexts(InteractionContextType.Guild)
  .addUserOption((option) => option.setName('user').setDescription('Member to receive the gift').setRequired(true))
  .addIntegerOption((option) => option.setName('amount').setDescription('Amount in Dex to gift').setRequired(true).setMinValue(1).setMaxValue(2000));
export const robUserCommand = new SlashCommandBuilder().setName('robuser').setDescription('Rob a member using a Robbingusertool').setContexts(InteractionContextType.Guild)
  .addUserOption((option) => option.setName('user').setDescription('Member to target').setRequired(true));
export const leaderboardCommand = new SlashCommandBuilder().setName('leaderboard').setDescription('View the richest members').setContexts(InteractionContextType.Guild);
export const economyCommand = new SlashCommandBuilder().setName('economy').setDescription('Manage the server economy').setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand((sub) => sub.setName('on').setDescription('Enable or repair the economy'))
  .addSubcommand((sub) => sub.setName('off').setDescription('Disable the economy'))
  .addSubcommand((sub) => sub.setName('pause').setDescription('Pause economy commands'))
  .addSubcommand((sub) => sub.setName('resume').setDescription('Resume economy commands'))
  .addSubcommand((sub) => sub.setName('status').setDescription('Show economy status'))
  .addSubcommand((sub) => sub.setName('give').setDescription('Give Dex to a member')
    .addUserOption((option) => option.setName('user').setDescription('Member').setRequired(true))
    .addIntegerOption((option) => option.setName('amount').setDescription('Amount in Dex').setRequired(true).setMinValue(1).setMaxValue(1000000)))
  .addSubcommand((sub) => sub.setName('take').setDescription('Take Dex from a member')
    .addUserOption((option) => option.setName('user').setDescription('Member').setRequired(true))
    .addIntegerOption((option) => option.setName('amount').setDescription('Amount in Dex').setRequired(true).setMinValue(1).setMaxValue(1000000)))
  .addSubcommand((sub) => sub.setName('reset').setDescription('Reset a member wallet')
    .addUserOption((option) => option.setName('user').setDescription('Member').setRequired(true)))
  .addSubcommand((sub) => sub.setName('help').setDescription('Show short economy help'));

export const economyCommands = [
  rewardCommand, balanceCommand, shopCommand, storeCommand, buyCommand, giftCommand, robUserCommand,
  leaderboardCommand, economyCommand,
];
