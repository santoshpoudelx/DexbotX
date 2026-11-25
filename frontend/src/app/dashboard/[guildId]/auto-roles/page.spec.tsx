// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AutoRolesPage from './page';

const mocks = vi.hoisted(() => ({
  guildId: 'guild-1',
  getGuild: vi.fn(),
  getChannels: vi.fn(),
  getActivity: vi.fn(),
  useSaveAutoRoles: vi.fn(),
  useTestAutoRoles: vi.fn(),
  saveAutoRoles: vi.fn(),
  testAutoRoles: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ guildId: mocks.guildId }),
}));

vi.mock('@/store/api', () => ({
  useGetGuildQuery: mocks.getGuild,
  useGetChannelsQuery: mocks.getChannels,
  useGetAutoRoleActivityQuery: mocks.getActivity,
  useSaveAutoRolesMutation: mocks.useSaveAutoRoles,
  useTestAutoRolesMutation: mocks.useTestAutoRoles,
}));

const config = {
  enabled: false,
  roleIds: [],
  delayMode: 'smart' as const,
  minDelaySeconds: 0,
  fixedDelaySeconds: 0,
  skipBots: true,
  waitForScreening: true,
  announce: {
    enabled: false,
    channelId: null,
    message: 'Congratulations {user} You unlocked new {role} role.',
    embed: { enabled: false, title: 'Role assigned {role}', description: 'Enjoy your new permissions and privileges! ✨', color: '#7c6cff', footer: 'Enjoy your new role! 💜' },
  },
};

const roleId = '12345678901234567';

const guildData = {
  guild: { id: 'guild-1', name: 'Test server', memberCount: 12 },
  autoRoles: {
    config,
    roles: {
      assignable: [{ id: roleId, name: 'Community', color: 1193046, position: 1 }],
      hidden: [{ id: 'role-2', name: 'Administrator', reason: 'has admin or moderation permissions' }],
    },
    checks: { hasManageRoles: false, roleBelowBot: false, canSendInChannel: false },
    canTest: false,
  },
};

describe('AutoRolesPage', () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.guildId = 'guild-1';
    mocks.getGuild.mockReturnValue({ data: guildData, isLoading: false });
    mocks.getChannels.mockReturnValue({ data: [] });
    mocks.getActivity.mockReturnValue({ data: { activity: [] }, isLoading: false });
    mocks.saveAutoRoles.mockReturnValue({
      unwrap: () => Promise.resolve({ config }),
    });
    mocks.testAutoRoles.mockReturnValue({ unwrap: () => Promise.resolve({ channelId: 'channel-1' }) });
    mocks.useSaveAutoRoles.mockReturnValue([mocks.saveAutoRoles, { isLoading: false }]);
    mocks.useTestAutoRoles.mockReturnValue([mocks.testAutoRoles, { isLoading: false }]);
  });

  it('uses the shared native select with readable role options', () => {
    render(<AutoRolesPage />);

    const rolePicker = screen.getByRole('combobox', { name: 'Role to assign' });
    const roleOption = screen.getByRole('option', { name: '@ Community' });
    expect(roleOption).toBeTruthy();
    expect(roleOption.textContent).toBe('@ Community');
    expect(roleOption.querySelector('span')).toBeNull();
    expect(rolePicker.classList.contains('auto-role-rich-select')).toBe(false);
    expect(rolePicker.classList.contains('appearance-none')).toBe(true);
    expect(rolePicker.parentElement?.parentElement?.classList.contains('w-full')).toBe(true);
    expect(screen.queryByRole('textbox', { name: 'Search roles' })).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Search announcement channels' })).toBeNull();
    expect(screen.queryByText(/role[s]? hidden/)).toBeNull();
    fireEvent.change(rolePicker, { target: { value: roleId } });

    expect(screen.getByText('Give the DexBotX bot role the Manage Roles permission in Server Settings, Roles.')).toBeTruthy();
  });

  it('shows the bot identity and text-only announcement in the preview', () => {
    render(<AutoRolesPage />);

    const preview = screen.getByText('DexBotX').closest('aside');
    expect(preview).toBeTruthy();
    expect(screen.getByText('App')).toBeTruthy();
    expect(preview?.textContent).toContain('Congratulations @username You unlocked new Member role.');
    expect(screen.queryByAltText('Preview of the card members will receive')).toBeNull();
  });

  it('renders the warning when a saved role is no longer assignable', () => {
    mocks.getGuild.mockReturnValue({
      data: {
        ...guildData,
        autoRoles: {
          ...guildData.autoRoles,
          config: { ...config, roleIds: ['role-2'] },
        },
      },
      isLoading: false,
    });

    render(<AutoRolesPage />);

    expect(screen.getByText('Saved role became unsafe')).toBeTruthy();
  });

  it('uses adaptive timing without exposing delay controls', () => {
    render(<AutoRolesPage />);

    expect(screen.queryByRole('heading', { name: 'Timing' })).toBeNull();
    expect(screen.queryByRole('radiogroup', { name: 'Auto role timing' })).toBeNull();
    expect(screen.queryByLabelText('Minimum delay')).toBeNull();
    expect(screen.queryByLabelText('Fixed delay')).toBeNull();
    expect(screen.getByText('Skip bots')).toBeTruthy();
    expect(screen.getByText('Wait for membership screening')).toBeTruthy();
  });

  it('shows field-level validation when required Auto Roles settings are missing', () => {
    render(<AutoRolesPage />);

    fireEvent.click(screen.getByRole('switch', { name: 'Enable Auto Roles' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Enable announcement' }));

    expect(screen.getByText('Choose exactly one role')).toBeTruthy();
    expect(screen.getByText('Choose an announcement channel')).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Role to assign' }).getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('combobox', { name: 'Channel' }).getAttribute('aria-invalid')).toBe('true');
    expect((screen.getByRole('button', { name: 'Save changes' }) as HTMLButtonElement).disabled).toBe(true);
    expect(mocks.saveAutoRoles).not.toHaveBeenCalled();
  });

  it('shows a channel loading error instead of an indefinite loading placeholder', () => {
    mocks.getChannels.mockReturnValue({
      error: { status: 500, data: { message: 'Channels could not be loaded.' } },
    });

    render(<AutoRolesPage />);

    expect(screen.getByRole('alert').textContent).toContain('Channels could not be loaded.');
    expect(screen.queryByText('Loading channels…')).toBeNull();
  });

  it('does not present a failed activity request as an empty activity list', () => {
    mocks.getActivity.mockReturnValue({
      error: { status: 500, data: { message: 'Activity could not be loaded.' } },
      isLoading: false,
    });

    render(<AutoRolesPage />);

    expect(screen.getByRole('alert').textContent).toContain('Activity could not be loaded.');
    expect(screen.queryByText('No auto-role activity yet.')).toBeNull();
  });

  it('shows server validation issues on the affected field and keeps the draft unsaved', async () => {
    mocks.saveAutoRoles.mockReturnValue({
      unwrap: () => Promise.reject({
        status: 400,
        data: {
          message: 'Validation failed',
          issues: [{ path: 'roleIds', message: 'Choose an assignable role below the bot in the role hierarchy' }],
        },
      }),
    });

    render(<AutoRolesPage />);
    const rolePicker = screen.getByRole('combobox', { name: 'Role to assign' });
    fireEvent.change(rolePicker, { target: { value: roleId } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Choose an assignable role below the bot in the role hierarchy')).toBeTruthy();
    expect(document.activeElement).toBe(rolePicker);
    expect(screen.getByText('Unsaved changes')).toBeTruthy();
  });

  it('places recent activity after the preview in the same responsive column', () => {
    render(<AutoRolesPage />);

    const preview = screen.getByRole('heading', { name: 'Announcement preview' });
    const activity = screen.getByRole('heading', { name: 'Recent activity' });
    expect(preview.closest('aside')).toBe(activity.closest('aside'));
    expect(preview.compareDocumentPosition(activity) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('matches the Welcome editor save bar and preview status', () => {
    render(<AutoRolesPage />);

    expect(screen.getByText('Not sending yet')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Discard' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Send test to channel' })).toBeTruthy();
  });

  it('matches the standalone Welcome embed section layout and fields', () => {
    render(<AutoRolesPage />);

    const embedHeading = screen.getByRole('heading', { name: 'Embed' });
    const announcementHeading = screen.getByRole('heading', { name: 'Announcement' });
    const embedCard = embedHeading.closest('.rounded-xl');
    const announcementCard = announcementHeading.closest('.rounded-xl');
    expect(embedCard?.parentElement).toBe(announcementCard?.parentElement);
    expect(screen.getByRole('switch', { name: 'Enable embed' })).toBeTruthy();
    expect(screen.getByLabelText('Title')).toBeTruthy();
    expect(screen.getByLabelText('Description')).toBeTruthy();
    expect((screen.getByLabelText('Footer') as HTMLInputElement).value).toBe('Enjoy your new role! 💜');
    expect(screen.getByText('Variables like {user}, {role}, and {memberCount} work here too.')).toBeTruthy();
    expect(screen.getByLabelText('Colour').parentElement?.parentElement?.parentElement?.classList.contains('grid')).toBe(true);

    fireEvent.click(screen.getByRole('switch', { name: 'Enable embed' }));
    const preview = screen.getByRole('heading', { name: 'Announcement preview' }).closest('aside');
    expect(preview?.textContent).toContain('Role assigned Member');
    expect(preview?.textContent).toContain('Enjoy your new permissions and privileges! ✨');
    expect(preview?.textContent).toContain('Enjoy your new role! 💜');
  });

  it('loads the new guild embed defaults from the backend when switching guilds', () => {
    const firstConfig = {
      ...config,
      announce: {
        ...config.announce,
        embed: {
          ...config.announce.embed,
          title: 'Previous guild title',
          description: 'Previous guild description',
          footer: '',
        },
      },
    };
    mocks.getGuild.mockReturnValue({
      data: {
        ...guildData,
        autoRoles: {
          ...guildData.autoRoles,
          config: firstConfig,
        },
      },
      isLoading: false,
    });

    const { rerender } = render(<AutoRolesPage />);
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Previous guild title');
    expect((screen.getByLabelText('Description') as HTMLTextAreaElement).value).toBe('Previous guild description');
    expect((screen.getByLabelText('Footer') as HTMLInputElement).value).toBe('');

    mocks.guildId = 'guild-2';
    mocks.getGuild.mockReturnValue({
      data: {
        ...guildData,
        guild: { ...guildData.guild, id: 'guild-2' },
        autoRoles: { ...guildData.autoRoles, config },
      },
      isLoading: false,
    });
    rerender(<AutoRolesPage />);

    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Role assigned {role}');
    expect((screen.getByLabelText('Description') as HTMLTextAreaElement).value).toBe('Enjoy your new permissions and privileges! ✨');
    expect((screen.getByLabelText('Footer') as HTMLInputElement).value).toBe('Enjoy your new role! 💜');
  });
});
