import { describe, expect, it } from 'vitest';
import { NAV_ITEMS } from './nav-config';

describe('dashboard navigation', () => {
  it('places Auto Roles after Goodbye in the shared modules list', () => {
    const modules = NAV_ITEMS.filter((item) => item.section === 'modules');
    const goodbyeIndex = modules.findIndex((item) => item.id === 'goodbye');
    const autoRolesIndex = modules.findIndex((item) => item.id === 'auto-roles');

    expect(autoRolesIndex).toBe(goodbyeIndex + 1);
    expect(modules[autoRolesIndex]).toMatchObject({
      label: 'Auto Roles',
      href: expect.any(Function),
    });
  });
});
