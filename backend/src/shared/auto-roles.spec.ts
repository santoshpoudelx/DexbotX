import {
  computeAutoRoleDelay,
  defaultAutoRoleConfig,
  getAutoRoleSafetyReason,
  normalizeAutoRoleConfig,
  renderAutoRoleTemplate,
  validateAutoRoleTemplate,
} from './auto-roles';

describe('auto-role helpers', () => {
  it('uses quiet smart timing and clamps fixed timing', () => {
    expect(computeAutoRoleDelay({
      mode: 'smart', minDelaySeconds: 0, fixedDelaySeconds: 0,
      joinsLastMinute: 1, queueWaiting: 2, discordBlockedSeconds: 0,
      nextFreeSlotSeconds: 0, jitterSeed: 0,
    })).toBe(0);
    expect(computeAutoRoleDelay({
      mode: 'smart', minDelaySeconds: 20, fixedDelaySeconds: 0,
      joinsLastMinute: 1, queueWaiting: 2, discordBlockedSeconds: 0,
      nextFreeSlotSeconds: 0, jitterSeed: 0,
    })).toBe(20);
    expect(computeAutoRoleDelay({
      mode: 'smart', minDelaySeconds: 0, fixedDelaySeconds: 0,
      joinsLastMinute: 2, queueWaiting: 0, discordBlockedSeconds: 0,
      nextFreeSlotSeconds: 2, jitterSeed: 0,
    })).toBe(2);
    expect(computeAutoRoleDelay({
      mode: 'fixed', minDelaySeconds: 0, fixedDelaySeconds: 900,
      joinsLastMinute: 0, queueWaiting: 0, discordBlockedSeconds: 0,
      nextFreeSlotSeconds: 0,
    })).toBe(480);
  });

  it('spreads loaded joins and never exceeds the 480-second cap', () => {
    const result = computeAutoRoleDelay({
      mode: 'smart', minDelaySeconds: 30, fixedDelaySeconds: 0,
      joinsLastMinute: 100, queueWaiting: 100, discordBlockedSeconds: 100,
      nextFreeSlotSeconds: 500, jitterSeed: 1,
    });
    expect(result).toBe(480);
  });

  it('normalizes old-format rows, preserves the first role, and always uses smart timing', () => {
    const normalized = normalizeAutoRoleConfig({
      enabled: true,
      roleIds: ['123456789012345678', '223456789012345678'],
      delayMode: 'fixed',
      delaySeconds: 900,
      minDelaySeconds: 15,
      skipBots: false,
    });
    expect(normalized.roleIds).toEqual(['123456789012345678']);
    expect(normalized.delayMode).toBe('smart');
    expect(normalized.minDelaySeconds).toBe(0);
    expect(normalized.fixedDelaySeconds).toBe(0);
    expect(normalized.skipBots).toBe(false);
    expect(normalizeAutoRoleConfig({
      delayMode: 'instant',
      delaySeconds: 45,
    }).fixedDelaySeconds).toBe(0);
    expect(normalizeAutoRoleConfig({
      ...defaultAutoRoleConfig(),
      delayMode: 'fixed',
      minDelaySeconds: 30,
      fixedDelaySeconds: 90,
    })).toMatchObject({
      delayMode: 'smart',
      minDelaySeconds: 0,
      fixedDelaySeconds: 0,
    });
  });

  it('rejects unknown variables and escalations', () => {
    expect(validateAutoRoleTemplate('Hello {unknown}').valid).toBe(false);
    expect(validateAutoRoleTemplate('Congratulations {user}, you got {role}').valid).toBe(true);
  });

  it('normalizes and preserves Auto Roles embed settings', () => {
    const normalized = normalizeAutoRoleConfig({
      ...defaultAutoRoleConfig(),
      announce: {
        enabled: true,
        channelId: '123456789012345678',
        message: 'Welcome {user}',
        embed: {
          enabled: true,
          title: 'Auto role',
          description: '{user} got {role}',
          color: '#ff0000',
          footer: '{server}',
        },
      },
    });
    expect(normalized.announce.embed).toEqual({
      enabled: true,
      title: 'Auto role',
      description: '{user} got {role}',
      color: '#ff0000',
      footer: '{server}',
    });
  });

  it('uses the updated announcement copy for new and legacy configurations', () => {
    const defaults = defaultAutoRoleConfig();
    const legacy = normalizeAutoRoleConfig({
      enabled: false,
      roleIds: [],
      delayMode: 'smart',
      minDelaySeconds: 0,
      fixedDelaySeconds: 0,
      skipBots: true,
      waitForScreening: true,
      announce: { enabled: false, channelId: null, message: defaults.announce.message },
    });
    const invalid = normalizeAutoRoleConfig({ unexpected: true });

    expect(legacy.announce.message).toBe(defaults.announce.message);
    expect(legacy.announce.embed).toEqual(defaults.announce.embed);
    expect(invalid.announce.message).toBe(defaults.announce.message);
    expect(invalid.announce.embed).toEqual(defaults.announce.embed);
  });

  it('applies default embed text when title, description, or footer is blank', () => {
    const defaults = defaultAutoRoleConfig();
    const unconfigured = normalizeAutoRoleConfig({
      ...defaults,
      announce: {
        ...defaults.announce,
        embed: { ...defaults.announce.embed, title: '', description: '', footer: '' },
      },
    });
    const partiallyConfigured = normalizeAutoRoleConfig({
      ...defaults,
      announce: {
        ...defaults.announce,
        embed: {
          ...defaults.announce.embed,
          enabled: true,
          title: 'Custom title',
          description: 'Custom description',
          footer: '',
        },
      },
    });

    expect(unconfigured.announce.embed).toEqual(defaults.announce.embed);
    expect(partiallyConfigured.announce.embed).toEqual({
      ...defaults.announce.embed,
      enabled: true,
      title: 'Custom title',
      description: 'Custom description',
    });
  });

  it('renders role names as text and batches real mentions', () => {
    const rendered = renderAutoRoleTemplate('Welcome {user} to {server} for {role}', {
      username: 'newmember',
      roleName: 'Member',
      serverName: 'Alpha',
      memberCount: 12,
      userMentions: ['<@111>', '<@222>'],
    });
    expect(rendered).toBe('Welcome <@111> and <@222> to Alpha for Member');
    expect(renderAutoRoleTemplate('@everyone and @here', {
      username: 'newmember',
      roleName: 'Member',
      serverName: 'Alpha',
      memberCount: 12,
      userMentions: [],
    })).toBe('@\u200beveryone and @\u200bhere');
  });

  it('rejects unsafe roles with one shared safety result', () => {
    const botStatus = { highestPosition: 10, highestRoleId: null, manageRoles: true };
    expect(getAutoRoleSafetyReason('123', {
      id: '123', name: '@everyone', position: 0, permissions: '0',
      managed: false, tags: {},
    }, botStatus)).toBe('everyone');
    expect(getAutoRoleSafetyReason('123', {
      id: 'role-1', name: 'Admin', position: 2, permissions: '8',
      managed: false, tags: {},
    }, botStatus)).toBe('has admin or moderation permissions');
    expect(getAutoRoleSafetyReason('123', {
      id: 'role-2', name: 'Moderator', position: 2, permissions: String(1n << 13n),
      managed: false, tags: {},
    }, botStatus)).toBe('has admin or moderation permissions');
  });

  it('uses Discord snowflake tie-breaking when roles share a position', () => {
    const botStatus = {
      highestPosition: 10,
      highestRoleId: '100000000000000002',
      manageRoles: true,
    };
    const samePositionBelow = {
      id: '100000000000000003', name: 'Member', position: 10, permissions: '0',
      managed: false, tags: {},
    };
    const samePositionAbove = {
      ...samePositionBelow,
      id: '100000000000000001',
      name: 'Higher',
    };

    expect(getAutoRoleSafetyReason('100000000000000000', samePositionBelow, botStatus)).toBeNull();
    expect(getAutoRoleSafetyReason('100000000000000000', samePositionAbove, botStatus)).toBe('above the bot\'s role');
  });
});
