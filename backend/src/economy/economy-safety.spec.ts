import { roleSafetyReason, isBotOrManagedRole } from './economy-safety';
import { PermissionFlagsBits } from 'discord.js';

describe('economy role safety', () => {
  it('allows normal and manager/staff roles strictly below the bot highest role', () => {
    expect(roleSafetyReason({
      id: 'role1', name: 'Manager', position: 5,
      permissions: String(PermissionFlagsBits.ManageMessages | PermissionFlagsBits.KickMembers),
    }, 'guild1', 10, '100000000000000001')).toBeNull();
    expect(roleSafetyReason({
      id: 'role2', name: 'VIP', position: 3,
      permissions: '0',
    }, 'guild1', 10, '100000000000000001')).toBeNull();
  });

  it('filters out bot, managed, booster, and integration roles', () => {
    expect(isBotOrManagedRole({ managed: true })).toBe(true);
    expect(isBotOrManagedRole({ managed: false, tags: { bot_id: '123' } })).toBe(true);
    expect(isBotOrManagedRole({ managed: false, tags: { integration_id: '456' } })).toBe(true);
    expect(isBotOrManagedRole({ managed: false, tags: { premium_subscriber: null } })).toBe(false);
    expect(roleSafetyReason({
      id: 'role1', name: 'Bot role', position: 5, managed: true,
      permissions: '0',
    }, 'guild1', 10)).toContain('Bot and managed');
    expect(roleSafetyReason({
      id: 'role2', name: 'Another Bot', position: 5, managed: false, tags: { bot_id: '999' },
      permissions: '0',
    }, 'guild1', 10)).toContain('Bot and managed');
  });

  it('rejects everyone and roles at or above the bot highest role', () => {
    expect(roleSafetyReason({ id: 'guild1', name: '@everyone', position: 0, permissions: '0' }, 'guild1', 10))
      .toContain('@everyone');
    expect(roleSafetyReason({ id: 'role1', name: 'Top', position: 10, permissions: '0' }, 'guild1', 10))
      .toContain('highest role');
    expect(roleSafetyReason({ id: '100000000000000002', name: 'BotSelf', position: 10, permissions: '0' }, 'guild1', 10, '100000000000000002'))
      .toContain('highest role');
  });
});
