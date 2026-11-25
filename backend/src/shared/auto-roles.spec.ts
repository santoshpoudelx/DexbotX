import {
  AUTO_ROLE_MAX_DELAY_SECONDS,
  computeAutoRoleDelay,
  defaultAutoRoleConfig,
  getAutoRoleSafetyReason,
  normalizeAutoRoleConfig,
  renderAutoRoleTemplate,
  secondsToMilliseconds,
  validateAutoRoleTemplate,
} from './auto-roles';
import { makeJobId } from './job-id';

describe('auto-role helpers', () => {
  it('creates BullMQ-safe job ids', () => {
    expect(makeJobId('autorole', '900000000000000002', '900000000000000003', 123)).toBe(
      'autorole-900000000000000002-900000000000000003-123',
    );
    expect(() => makeJobId('autorole', 'guild:user')).toThrow();
    expect(() => makeJobId('123456')).toThrow();
  });
  it('uses extra delay and clamps it to 30 seconds', () => {
    expect(computeAutoRoleDelay({
      delaySeconds: 0, nextFreeSlotSeconds: 0,
    })).toBe(0);
    expect(computeAutoRoleDelay({
      delaySeconds: 20, nextFreeSlotSeconds: 0,
    })).toBe(20);
    expect(computeAutoRoleDelay({
      delaySeconds: 0, nextFreeSlotSeconds: 2,
    })).toBe(2);
    expect(computeAutoRoleDelay({
      delaySeconds: 900, nextFreeSlotSeconds: 0,
    })).toBe(30);
  });

  it('spreads 30 slots across unique seconds and caps all load inputs', () => {
    const burst = Array.from({ length: 30 }, (_, slot) => computeAutoRoleDelay({
      delaySeconds: 0,
      nextFreeSlotSeconds: slot,
    }));
    expect(burst).toEqual(Array.from({ length: 30 }, (_, index) => index));
    const loadedDelays = Array.from({ length: 1001 }, (_, slot) => computeAutoRoleDelay({
      delaySeconds: 3,
      nextFreeSlotSeconds: slot,
    }));
    expect(Math.max(...loadedDelays)).toBe(AUTO_ROLE_MAX_DELAY_SECONDS);
    expect(AUTO_ROLE_MAX_DELAY_SECONDS).toBe(30);
    expect(secondsToMilliseconds(30)).toBe(30000);
    expect(() => secondsToMilliseconds(Number.NaN)).toThrow();
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
    expect(normalized.delaySeconds).toBe(30);
    expect(normalized.skipBots).toBe(false);
    expect(normalizeAutoRoleConfig({
      delayMode: 'instant',
      delaySeconds: 45,
    }).delaySeconds).toBe(30);
    expect(normalizeAutoRoleConfig({
      delayMode: 'fixed',
      minDelaySeconds: 30,
      fixedDelaySeconds: 90,
    })).toMatchObject({ delaySeconds: 30 });
    expect(normalizeAutoRoleConfig({
      delayMode: 'smart',
      minDelaySeconds: 15,
      fixedDelaySeconds: 25,
    }).delaySeconds).toBe(15);
    expect(normalizeAutoRoleConfig({
      ...defaultAutoRoleConfig(),
      waitForScreening: false,
    }).waitForScreening).toBe(true);
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
