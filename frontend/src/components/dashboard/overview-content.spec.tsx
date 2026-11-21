// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OverviewContent } from './overview-content';

const mocks = vi.hoisted(() => ({
  getGuild: vi.fn(),
  getChannels: vi.fn(),
}));

vi.mock('@/store/api', () => ({
  useGetGuildQuery: mocks.getGuild,
  useGetChannelsQuery: mocks.getChannels,
}));

describe('OverviewContent', () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getChannels.mockReturnValue({ data: [] });
  });

  it.each([
    [true, 'Enabled'],
    [false, 'Disabled'],
  ])('shows Auto Roles as %s and links to its settings', (enabled, status) => {
    mocks.getGuild.mockReturnValue({
      data: {
        guild: { memberCount: 12 },
        settings: {
          welcome: { enabled: false, channelId: null },
          goodbye: { enabled: false, channelId: null },
        },
        autoRoles: { config: { enabled } },
      },
      isLoading: false,
    });

    render(<OverviewContent guildId="guild-1" />);

    const heading = screen.getByRole('heading', { name: 'Auto Roles' });
    const card = heading.parentElement;
    expect(card).not.toBeNull();
    if (!card) throw new Error('Auto Roles card was not rendered');

    expect(within(card).getByText(status)).toBeTruthy();
    expect(within(card).getByRole('link', { name: 'Configure Auto Roles' }).getAttribute('href'))
      .toBe('/dashboard/guild-1/auto-roles');
  });
});
