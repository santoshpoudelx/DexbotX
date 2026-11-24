import { roleSafetyReason } from './economy-safety';
import { PermissionFlagsBits } from 'discord.js';

describe('economy role safety', () => {
  it('rejects dangerous and managed roles', () => {
    expect(roleSafetyReason({
      id: 'role1', name: 'Danger', position: 5,
      permissions: String(PermissionFlagsBits.Administrator),
    }, 'guild1', 10)).toContain('Administrator');
    expect(roleSafetyReason({
      id: 'role1', name: 'Bot role', position: 5, managed: true,
      permissions: '0',
    }, 'guild1', 10)).toContain('Managed');
  });

  it('rejects everyone and roles at or above the bot', () => {
    expect(roleSafetyReason({ id: 'guild1', name: '@everyone', position: 0, permissions: '0' }, 'guild1', 10))
      .toContain('@everyone');
    expect(roleSafetyReason({ id: 'role1', name: 'Top', position: 10, permissions: '0' }, 'guild1', 10))
      .toContain('highest role');
  });
});
