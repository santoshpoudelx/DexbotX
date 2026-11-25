import { InternalServerErrorException } from '@nestjs/common';
import type {
  ButtonInteraction,
  ChatInputCommandInteraction,
  ModalSubmitInteraction,
  StringSelectMenuInteraction,
} from 'discord.js';
import type { DatabaseService } from '../db/database.service';
import { EconomyMessageService } from '../economy/economy-message.service';
import { defaultEconomySettings } from '../economy/economy.schema';
import { EconomySetupService } from '../economy/economy-setup.service';
import { WalletService } from '../economy/wallet.service';
import { DiscordRestService } from '../discord/discord-rest.service';
import { RedisService } from '../redis/redis.service';
import { EconomyCommandService } from './economy-command.service';
import { economyCommands } from './commands/economy';

const guildId = '100000000000000001';
const ownerId = '200000000000000001';
const targetId = '200000000000000002';
const attackerId = '200000000000000003';
const commandsChannelId = '300000000000000001';
const botUserId = '900000000000000001';

function createService(
  paused = false,
  enabled = true,
  options: { commandsChannelId?: string } = {},
) {
  const selectResults: unknown[][] = [];
  const setup = {
    get: jest.fn().mockResolvedValue({
      settings: defaultEconomySettings(),
      state: { enabled, paused, channels: { commands: options.commandsChannelId } },
    }),
    enable: jest.fn().mockResolvedValue({ message: 'Economy enabled.' }),
  };
  const wallet = {
    claimDaily: jest.fn(),
    getOrCreateWallet: jest.fn(),
    addCoins: jest.fn().mockResolvedValue(undefined),
    checkRobAttemptPrerequisites: jest.fn().mockResolvedValue('missing_tool'),
    rob: jest.fn().mockResolvedValue({ status: 'missing_tool' }),
    purchaseRobbingTool: jest.fn().mockResolvedValue({ name: 'Robbingusertool', price: 400 }),
  };
  const database = {
    db: {
      select: jest.fn(() => {
        const rows = selectResults.shift() ?? [];
        return {
          from: jest.fn(() => ({
            where: jest.fn(() => ({
              limit: jest.fn().mockResolvedValue(rows),
              orderBy: jest.fn(() => ({
                limit: jest.fn().mockResolvedValue(rows),
              })),
            })),
          })),
        };
      }),
      transaction: jest.fn().mockResolvedValue(undefined),
      update: jest.fn(() => ({
        set: jest.fn(() => ({ where: jest.fn().mockResolvedValue([]) })),
      })),
      insert: jest.fn(() => ({ values: jest.fn().mockResolvedValue([]) })),
    },
  };
  const redis = {
    client: {
      getdel: jest.fn(),
      set: jest.fn().mockResolvedValue('OK'),
      incr: jest.fn(),
      expire: jest.fn(),
    },
  };
  const economyMessages = {
    postFeed: jest.fn().mockResolvedValue(undefined),
    postHeist: jest.fn().mockResolvedValue(undefined),
    postBountyAnnouncement: jest.fn().mockResolvedValue(undefined),
    postBountyClaimAnnouncement: jest.fn().mockResolvedValue(undefined),
  };
  const discord = { createChannelMessage: jest.fn().mockResolvedValue({ id: '500000000000000001' }) };
  const service = new EconomyCommandService(
    setup as unknown as EconomySetupService,
    wallet as unknown as WalletService,
    database as unknown as DatabaseService,
    discord as unknown as DiscordRestService,
    redis as unknown as RedisService,
    economyMessages as unknown as EconomyMessageService,
  );
  return { service, setup, wallet, database, redis, economyMessages, discord, selectResults };
}

function chatCommand(commandName: string, channelId: string, userId = ownerId): ChatInputCommandInteraction {
  const state = { deferred: false, replied: false };
  return {
    get deferred() { return state.deferred; },
    get replied() { return state.replied; },
    id: '400000000000000001',
    commandName,
    guild: {
      id: guildId,
      ownerId,
      name: 'Test server',
      members: {
        fetch: jest.fn().mockResolvedValue({
          user: { createdTimestamp: Date.now() - 30 * 86400_000 },
          joinedTimestamp: Date.now() - 30 * 86400_000,
        }),
      },
    },
    guildId,
    channelId,
    user: { id: userId, username: 'Tester' },
    memberPermissions: { has: jest.fn(() => false) },
    options: { getSubcommand: jest.fn(() => 'on') },
    deferReply: jest.fn().mockImplementation(async () => { state.deferred = true; }),
    editReply: jest.fn().mockResolvedValue(undefined),
    reply: jest.fn().mockImplementation(async () => { state.replied = true; }),
    deleteReply: jest.fn().mockResolvedValue(undefined),
    showModal: jest.fn().mockImplementation(async () => { state.replied = true; }),
  } as unknown as ChatInputCommandInteraction;
}

function robUserInteraction(
  userCreatedTimestamp: number,
  joinedTimestamp: number,
  targetUserId = targetId,
): ChatInputCommandInteraction {
  const command = chatCommand('robuser', commandsChannelId);
  return {
    ...command,
    client: { user: { id: botUserId, username: 'DexBotX' } },
    guild: {
      id: guildId,
      ownerId,
      members: {
        fetch: jest.fn(async (userId: string) => ({
          id: userId,
          user: { id: userId, bot: false, createdTimestamp: userCreatedTimestamp },
          joinedTimestamp,
        })),
      },
    },
    options: { getUser: jest.fn(() => ({ id: targetUserId, bot: targetUserId === botUserId })) },
  } as unknown as ChatInputCommandInteraction;
}

function button(
  customId: string,
  userId = ownerId,
  emojiName?: string,
  onDefer?: () => void,
): ButtonInteraction {
  const state = { deferred: false, replied: false };
  return {
    get deferred() { return state.deferred; },
    get replied() { return state.replied; },
    customId,
    guild: { id: guildId, ownerId },
    guildId,
    user: { id: userId },
    memberPermissions: { has: jest.fn(() => false) },
    component: { emoji: emojiName ? { name: emojiName } : null },
    deferReply: jest.fn().mockImplementation(async () => {
      state.deferred = true;
      onDefer?.();
    }),
    editReply: jest.fn().mockResolvedValue(undefined),
    reply: jest.fn().mockImplementation(async () => { state.replied = true; }),
    deleteReply: jest.fn().mockResolvedValue(undefined),
    showModal: jest.fn().mockImplementation(async () => { state.replied = true; }),
  } as unknown as ButtonInteraction;
}

describe('EconomyCommandService interaction guards', () => {
  it('replies when economy setup fails with a server error', async () => {
    const { service, setup } = createService();
    setup.enable.mockRejectedValue(
      new InternalServerErrorException('Economy setup failed. Verify database migrations are applied and try again.'),
    );
    const interaction = chatCommand('economy', commandsChannelId);

    await service.handle(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith(
      'Economy setup failed. Verify database migrations are applied and try again.',
    );
  });

  it.each(['economy:reward', 'economy:shop', 'economy:buy:item'])(
    'blocks the %s button while the economy is paused',
    async (customId) => {
      const { service, wallet, database } = createService(true);
      const interaction = button(customId);

      await service.handleButton(interaction);

      expect(interaction.deferReply).toHaveBeenCalledTimes(1);
      expect(interaction.editReply).toHaveBeenCalledWith('The economy is paused.');
      expect(wallet.claimDaily).not.toHaveBeenCalled();
      expect(database.db.update).not.toHaveBeenCalled();
    },
  );

  it('defers ordinary store buttons before checking economy state or querying the store', async () => {
    const { service, setup, database } = createService();
    const interaction = button('economy:buy:shield', ownerId, undefined, () => {
      expect(setup.get).not.toHaveBeenCalled();
      expect(database.db.select).not.toHaveBeenCalled();
    });

    await service.handleButton(interaction);

    expect(interaction.deferReply).toHaveBeenCalledTimes(1);
  });

  it('blocks store select-menu purchases while the economy is disabled', async () => {
    const { service, setup } = createService(false, false);
    const state = { deferred: false };
    const interaction = {
      get deferred() { return state.deferred; },
      customId: 'economy:buy-select',
      guild: { id: guildId },
      values: ['shield'],
      component: { options: [{ value: 'shield' }] },
      deferReply: jest.fn().mockImplementation(async () => { state.deferred = true; }),
      editReply: jest.fn().mockResolvedValue(undefined),
      reply: jest.fn().mockResolvedValue(undefined),
    } as unknown as StringSelectMenuInteraction;

    await service.handleSelectMenu(interaction);

    expect(interaction.deferReply).toHaveBeenCalledTimes(1);
    expect(interaction.editReply).toHaveBeenCalledWith('The economy is not enabled in this server.');
    expect(setup.get).toHaveBeenCalledWith(guildId);
  });

  it('blocks pending custom-title modal purchases while the economy is paused', async () => {
    const { service, database } = createService(true);
    const interaction = {
      customId: 'economy:title-buy:title-item',
      guild: { id: guildId },
      deferReply: jest.fn().mockResolvedValue(undefined),
      editReply: jest.fn().mockResolvedValue(undefined),
    } as unknown as ModalSubmitInteraction;

    await service.handleModalSubmit(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith('The economy is paused.');
    expect(database.db.update).not.toHaveBeenCalled();
  });

  it('rejects a custom-title modal if its store item is no longer a custom title', async () => {
    const { service, selectResults, wallet } = createService();
    selectResults.push([{
      itemId: 'title-item',
      kind: 'shield',
      name: 'Shield',
      price: 150,
      stock: null,
    }]);
    const interaction = {
      customId: 'economy:title-buy:title-item',
      guild: { id: guildId },
      fields: { getTextInputValue: jest.fn(() => 'VIP') },
      deferReply: jest.fn().mockResolvedValue(undefined),
      editReply: jest.fn().mockResolvedValue(undefined),
    } as unknown as ModalSubmitInteraction;

    await service.handleModalSubmit(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith('That item is not a custom title.');
    expect(wallet.getOrCreateWallet).not.toHaveBeenCalled();
  });

  it('rejects wallet-reset confirmations from an unauthorized user without consuming the token', async () => {
    const { service, redis, database } = createService();
    const interaction = button(
      `economy:reset-confirm:${targetId}:${ownerId}:123e4567-e89b-12d3-a456-426614174000`,
      attackerId,
    );

    await service.handleButton(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith(
      'Only the authorized requester can confirm this wallet reset.',
    );
    expect(redis.client.getdel).not.toHaveBeenCalled();
    expect(database.db.update).not.toHaveBeenCalled();
  });

  it('consumes an authorized wallet-reset confirmation exactly once', async () => {
    const { service, setup, redis, database } = createService();
    const command = {
      commandName: 'economy',
      guild: { id: guildId, ownerId, name: 'Test server' },
      user: { id: ownerId },
      memberPermissions: { has: jest.fn(() => false) },
      options: {
        getSubcommand: jest.fn(() => 'reset'),
        getUser: jest.fn(() => ({ id: targetId })),
      },
      deferReply: jest.fn().mockResolvedValue(undefined),
      editReply: jest.fn().mockResolvedValue(undefined),
    } as unknown as ChatInputCommandInteraction;

    await service.handle(command);

    expect(setup.get).toHaveBeenCalledWith(guildId);
    expect(redis.client.set).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`^economy:reset-confirm:${guildId}:${targetId}:${ownerId}:`)),
      ownerId,
      'EX',
      300,
      'NX',
    );
    const confirmationKey = redis.client.set.mock.calls[0][0] as string;
    const token = confirmationKey.split(':').at(-1);
    const interaction = button(`economy:reset-confirm:${targetId}:${ownerId}:${token}`);
    redis.client.getdel.mockResolvedValueOnce(ownerId).mockResolvedValueOnce(null);

    await service.handleButton(interaction);
    await service.handleButton(interaction);

    expect(redis.client.getdel).toHaveBeenCalledTimes(2);
    expect(database.db.update).toHaveBeenCalledTimes(1);
  });

  it('restricts owner economy commands to the configured commands channel', async () => {
    const { service } = createService(false, true, { commandsChannelId });
    const interaction = chatCommand('economy', '400000000000000001');

    await service.handle(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith(`Please use this in <#${commandsChannelId}>.`);
    expect(interaction.options.getSubcommand).not.toHaveBeenCalled();
  });

  it('restricts member economy commands to the configured commands channel', async () => {
    const { service, wallet } = createService(false, true, { commandsChannelId });
    const interaction = chatCommand('reward', '400000000000000001');

    await service.handle(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith(`Please use this in <#${commandsChannelId}>.`);
    expect(wallet.claimDaily).not.toHaveBeenCalled();
  });

  it('registers and dispatches /store as an alias for /shop', async () => {
    const { service, database } = createService(false, true, { commandsChannelId });
    const interaction = chatCommand('store', commandsChannelId);

    await service.handle(interaction);

    expect(economyCommands.map((command) => command.name)).toEqual(
      expect.arrayContaining(['shop', 'store', 'robuser']),
    );
    expect(economyCommands.map((command) => command.name)).not.toContain('get1kdex');
    expect(economyCommands.map((command) => command.name)).not.toContain('steal');
    expect(database.db.select).toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalledWith('The economy store is empty.');
  });

  it('opens the custom-title modal as the initial store-button response', async () => {
    const { service, setup, wallet, database } = createService();
    const interaction = button('economy:buy-title:title-item');

    await service.handleButton(interaction);

    expect(interaction.deferReply).not.toHaveBeenCalled();
    expect(interaction.showModal).toHaveBeenCalledTimes(1);
    expect(setup.get).not.toHaveBeenCalled();
    expect(wallet.getOrCreateWallet).not.toHaveBeenCalled();
    expect(database.db.select).not.toHaveBeenCalled();
  });

  it('keeps opening the custom-title modal from existing store buttons', async () => {
    const { service } = createService();
    const interaction = button('economy:buy:title-item', ownerId, '🏷️');

    await service.handleButton(interaction);

    expect(interaction.deferReply).not.toHaveBeenCalled();
    expect(interaction.showModal).toHaveBeenCalledTimes(1);
  });

  it('opens the custom-title modal as the initial store-select response', async () => {
    const { service, setup, wallet, database } = createService();
    const interaction = {
      customId: 'economy:buy-select',
      guild: { id: guildId, ownerId },
      values: ['title-item'],
      component: { options: [{ value: 'title-item', emoji: { name: '🏷️' } }] },
      user: { id: ownerId },
      deferReply: jest.fn().mockResolvedValue(undefined),
      editReply: jest.fn().mockResolvedValue(undefined),
      reply: jest.fn().mockResolvedValue(undefined),
      showModal: jest.fn().mockResolvedValue(undefined),
    } as unknown as StringSelectMenuInteraction;

    await service.handleSelectMenu(interaction);

    expect(interaction.deferReply).not.toHaveBeenCalled();
    expect(interaction.showModal).toHaveBeenCalledTimes(1);
    expect(setup.get).not.toHaveBeenCalled();
    expect(wallet.getOrCreateWallet).not.toHaveBeenCalled();
    expect(database.db.select).not.toHaveBeenCalled();
  });

  it.each(['economy:bounty-buy:bounty-item', 'economy:bounty-target:bounty-item'])(
    'opens the bounty amount modal as the initial response for %s',
    async (customId) => {
      const { service, setup } = createService();
      const interaction = {
        customId,
        guild: { id: guildId, ownerId },
        values: [targetId],
        user: { id: ownerId },
        deferReply: jest.fn().mockResolvedValue(undefined),
        editReply: jest.fn().mockResolvedValue(undefined),
        reply: jest.fn().mockResolvedValue(undefined),
        showModal: jest.fn().mockResolvedValue(undefined),
      } as unknown as StringSelectMenuInteraction;

      await service.handleSelectMenu(interaction);

      expect(interaction.deferReply).not.toHaveBeenCalled();
      expect(interaction.showModal).toHaveBeenCalledTimes(1);
      expect(setup.get).not.toHaveBeenCalled();
    },
  );

  it.each([
    `economy:bounty-buy-amount:${targetId}`,
    `economy:bounty-amount:${targetId}`,
  ])('announces a placed bounty without identifying its buyer (%s)', async (customId) => {
    const { service, database, economyMessages } = createService();
    const interaction = {
      customId,
      guild: { id: guildId },
      user: { id: ownerId },
      fields: { getTextInputValue: jest.fn(() => '100') },
      deferReply: jest.fn().mockResolvedValue(undefined),
      editReply: jest.fn().mockResolvedValue(undefined),
    } as unknown as ModalSubmitInteraction;

    await service.handleModalSubmit(interaction);

    expect(database.db.transaction).toHaveBeenCalledTimes(1);
    expect(interaction.editReply).toHaveBeenCalledWith(
      `Held 100 Dex as a bounty on <@${targetId}>.`,
    );
    expect(economyMessages.postBountyAnnouncement).toHaveBeenCalledWith(
      guildId,
      100,
      targetId,
    );
  });

  it('opens the custom-title modal as the initial /buy response', async () => {
    const { service, wallet, selectResults } = createService();
    selectResults.push([{
      itemId: 'title-item',
      kind: 'custom_title',
      name: 'Custom Title',
      price: 250,
      stock: null,
    }]);
    wallet.getOrCreateWallet.mockResolvedValue({ balance: 500 } as never);
    const interaction = {
      ...chatCommand('buy', commandsChannelId),
      options: {
        getSubcommand: jest.fn(() => 'on'),
        getString: jest.fn(() => 'Custom Title'),
      },
    } as unknown as ChatInputCommandInteraction;

    await service.handle(interaction);

    expect(interaction.deferReply).not.toHaveBeenCalled();
    expect(interaction.showModal).toHaveBeenCalledTimes(1);
  });

  it('reports the missing Robbingusertool before eligibility when the user has no tool', async () => {
    const { service, wallet } = createService();
    const interaction = robUserInteraction(Date.now() - 86400_000, Date.now() - 86400_000);

    await service.handle(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith(
      'You do not have a Robbingusertool. Buy one from /shop or #store before robbing; it is consumed only after a successful robbery.',
    );
    expect(wallet.checkRobAttemptPrerequisites).toHaveBeenCalledWith(guildId, ownerId, interaction.id);
    expect(wallet.rob).not.toHaveBeenCalled();
  });

  it('reports eligibility when the user owns a Robbingusertool', async () => {
    const { service, wallet } = createService();
    wallet.checkRobAttemptPrerequisites.mockResolvedValue(null);
    const interaction = robUserInteraction(Date.now() - 86400_000, Date.now() - 86400_000);

    await service.handle(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith(
      'You are not eligible to rob yet. Your account must be at least 7 days old, and you must have been in this server for 24 hours.',
    );
    expect(wallet.rob).not.toHaveBeenCalled();
  });

  it.each([
    ['already_processed', 'This robbery attempt has already been processed.'],
    ['protected', 'That member cannot be robbed right now. Try another member.'],
    ['blocked_by_shield', 'That member cannot be robbed right now. Try another member.'],
    ['decoy', 'A Decoy blocked the robbery. You got nothing, and your Robbingusertool was not consumed.'],
  ] as const)('shows a clear robbery result for %s', async (status, message) => {
    const { service, wallet } = createService();
    wallet.checkRobAttemptPrerequisites.mockResolvedValue(null);
    wallet.rob.mockResolvedValue({ status } as never);
    const oldEnough = Date.now() - 30 * 86400_000;
    const interaction = robUserInteraction(oldEnough, oldEnough);

    await service.handle(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith(message);
  });

  it('allows robbery attempts at any time and requires a Robbingusertool', async () => {
    const { service, wallet, database } = createService();
    const oldEnough = Date.now() - 30 * 86400_000;
    const interaction = robUserInteraction(oldEnough, oldEnough);

    await service.handle(interaction);

    expect(wallet.checkRobAttemptPrerequisites).toHaveBeenCalledWith(guildId, ownerId, interaction.id);
    expect(interaction.editReply).toHaveBeenCalledWith(
      'You do not have a Robbingusertool. Buy one from /shop or #store before robbing; it is consumed only after a successful robbery.',
    );
    expect(wallet.rob).not.toHaveBeenCalled();
    expect(database.db.select).not.toHaveBeenCalled();
  });

  it('announces a claimed bounty with the robber and target, but not the bounty setter', async () => {
    const { service, wallet, economyMessages } = createService();
    wallet.checkRobAttemptPrerequisites.mockResolvedValue(null);
    wallet.rob.mockResolvedValue({ status: 'success', amount: 10, bountyPaid: 100 });
    const oldEnough = Date.now() - 30 * 86400_000;
    const interaction = robUserInteraction(oldEnough, oldEnough);

    await service.handle(interaction);

    expect(economyMessages.postBountyClaimAnnouncement).toHaveBeenCalledWith(
      guildId,
      ownerId,
      100,
      targetId,
    );
    expect(economyMessages.postFeed).not.toHaveBeenCalled();
  });

  it('replies and announces when someone tries to rob this bot', async () => {
    const { service, economyMessages, database } = createService();
    const interaction = robUserInteraction(Date.now() - 86400_000, Date.now() - 86400_000, botUserId);

    await service.handle(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith(
      'Nice Try, Feel Free To Go Outside and Touch Some Grasss',
    );
    expect(economyMessages.postHeist).toHaveBeenCalledWith(
      guildId,
      'Tester Is trying to Rob DexBotX appricate him gyz 😂',
    );
    expect(database.db.select).not.toHaveBeenCalled();
  });
});

describe('EconomyCommandService ephemeral replies', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('deletes private economy command replies after 60 seconds', async () => {
    const { service } = createService(false, false);
    const interaction = chatCommand('balance', commandsChannelId);

    await service.handle(interaction);
    expect(interaction.deleteReply).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(60_000);

    expect(interaction.deleteReply).toHaveBeenCalledTimes(1);
  });

  it('announces a successful daily claim publicly with its streak and no private confirmation', async () => {
    const { service, wallet, discord, economyMessages } = createService(false, true, { commandsChannelId });
    wallet.claimDaily.mockResolvedValue({ claimed: true, amount: 55, streakDay: 2 } as never);
    const interaction = chatCommand('reward', commandsChannelId);

    await service.handle(interaction);

    expect(discord.createChannelMessage).toHaveBeenCalledWith(commandsChannelId, {
      content: `<@${ownerId}> claimed 55 Dex with a 2-day streak.`,
      allowed_mentions: { parse: [] },
    });
    expect(interaction.editReply).not.toHaveBeenCalled();
    expect(interaction.deleteReply).toHaveBeenCalledTimes(1);
    expect(economyMessages.postFeed).not.toHaveBeenCalled();
  });
});
