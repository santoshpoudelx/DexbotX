// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OverviewContent } from './overview-content';

const mocks = vi.hoisted(() => ({
  getGuild: vi.fn(),
  getChannels: vi.fn(),
  getEconomy: vi.fn(),
}));

vi.mock('@/store/api', () => ({
  useGetGuildQuery: mocks.getGuild,
  useGetChannelsQuery: mocks.getChannels,
  useGetEconomyQuery: mocks.getEconomy,
}));

describe('OverviewContent', () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getChannels.mockReturnValue({ data: [] });
    mocks.getEconomy.mockReturnValue({
      data: { state: { enabled: false, paused: false } },
      isLoading: false,
    });
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

  it.each([
    [{ enabled: true, paused: false }, 'Enabled', 'Economy is active for this server.'],
    [{ enabled: true, paused: true }, 'Paused', 'Economy is paused for this server.'],
    [{ enabled: false, paused: false }, 'Disabled', 'Economy is disabled for this server.'],
  ])('shows Economy status %s and links to its settings', (state, status, description) => {
    mocks.getGuild.mockReturnValue({
      data: {
        guild: { memberCount: 12 },
        settings: {
          welcome: { enabled: false, channelId: null },
          goodbye: { enabled: false, channelId: null },
        },
        autoRoles: { config: { enabled: false } },
      },
      isLoading: false,
    });
    mocks.getEconomy.mockReturnValue({ data: { state }, isLoading: false });

    render(<OverviewContent guildId="guild-1" />);

    const heading = screen.getByRole('heading', { name: 'Economy' });
    const card = heading.parentElement;
    expect(card).not.toBeNull();
    if (!card) throw new Error('Economy card was not rendered');

    expect(within(card).getByText(status)).toBeTruthy();
    expect(within(card).getByText(description)).toBeTruthy();
    expect(within(card).getByRole('link', { name: 'Configure Economy' }).getAttribute('href'))
      .toBe('/dashboard/guild-1/economy');
  });

  it('shows Economy status loading and unavailable states', () => {
    mocks.getGuild.mockReturnValue({
      data: {
        guild: { memberCount: 12 },
        settings: {
          welcome: { enabled: false, channelId: null },
          goodbye: { enabled: false, channelId: null },
        },
        autoRoles: { config: { enabled: false } },
      },
      isLoading: false,
    });
    mocks.getEconomy.mockReturnValueOnce({ isLoading: true }).mockReturnValueOnce({ error: true, isLoading: false });

    const { rerender } = render(<OverviewContent guildId="guild-1" />);
    expect(screen.getByText('Loading')).toBeTruthy();
    expect(screen.getByText('Loading Economy status…')).toBeTruthy();

    rerender(<OverviewContent guildId="guild-1" />);
    expect(screen.getByText('Unavailable')).toBeTruthy();
    expect(screen.getByText('Could not load Economy status. Open settings to retry.')).toBeTruthy();
  });
});
