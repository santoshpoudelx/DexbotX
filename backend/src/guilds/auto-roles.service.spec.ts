import { AutoRolesService } from './auto-roles.service';
import { defaultAutoRoleConfig } from '../shared/auto-roles';

describe('AutoRolesService', () => {
  it('builds the role list with safe roles first and hidden roles explained', () => {
    const service = new AutoRolesService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const response = service.classifyRoles('100000000000000001', [
      { id: '100000000000000002', name: 'Lower', color: 2, position: 2, permissions: '0', managed: false, tags: {} },
      { id: '100000000000000003', name: 'Higher', color: 3, position: 8, permissions: '0', managed: false, tags: {} },
      { id: '100000000000000004', name: 'Bot', color: 4, position: 5, permissions: '0', managed: true, tags: {} },
      { id: '100000000000000005', name: 'Moderator', color: 5, position: 1, permissions: String(1n << 13n), managed: false, tags: {} },
      { id: '100000000000000006', name: 'Same position below bot', color: 6, position: 5, permissions: '0', managed: false, tags: {} },
      { id: '100000000000000003', name: 'Same position above bot', color: 3, position: 5, permissions: '0', managed: false, tags: {} },
    ], { highestPosition: 5, highestRoleId: '100000000000000004', manageRoles: true });

    expect(response.assignable.map((role) => role.name)).toEqual(['Same position below bot', 'Lower']);
    expect(response.hidden).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Higher', reason: "above the bot's role" }),
      expect.objectContaining({ name: 'Bot', reason: 'bot or integration role' }),
      expect.objectContaining({ name: 'Moderator', reason: 'has admin or moderation permissions' }),
      expect.objectContaining({ name: 'Same position above bot', reason: "above the bot's role" }),
    ]));
  });

  it('reads channel permission status from Redis without a Discord REST request', async () => {
    const canBotPost = jest.fn();
    const config = defaultAutoRoleConfig();
    config.announce.channelId = '100000000000000006';
    const service = new AutoRolesService(
      {} as never,
      { get: jest.fn().mockResolvedValue({ autoRoles: config }) } as never,
      {
        getRoles: jest.fn().mockResolvedValue([]),
        getBotStatus: jest.fn().mockResolvedValue({ highestPosition: 1, highestRoleId: null, manageRoles: true }),
      } as never,
      {} as never,
      {} as never,
      { canBotPost } as never,
      { client: { get: jest.fn().mockResolvedValue('1') } } as never,
    );

    const result = await service.get({ id: '100000000000000001' } as never);

    expect(result.checks.canSendInChannel).toBe(true);
    expect(canBotPost).not.toHaveBeenCalled();
  });

  it('returns default embed text when saved title, description, and footer are blank', async () => {
    const config = defaultAutoRoleConfig();
    config.announce.embed.title = '';
    config.announce.embed.description = '';
    config.announce.embed.footer = '';
    const service = new AutoRolesService(
      {} as never,
      { get: jest.fn().mockResolvedValue({ autoRoles: config }) } as never,
      {
        getRoles: jest.fn().mockResolvedValue([]),
        getBotStatus: jest.fn().mockResolvedValue({ highestPosition: 1, highestRoleId: null, manageRoles: true }),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      { client: { get: jest.fn() } } as never,
    );

    const result = await service.get({ id: '100000000000000001' } as never);

    expect(result.config.announce.embed).toEqual(defaultAutoRoleConfig().announce.embed);
  });
});
