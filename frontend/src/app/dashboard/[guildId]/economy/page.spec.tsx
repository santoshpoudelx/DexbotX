// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EconomyPage from './page';

const mocks = vi.hoisted(() => ({
  guildId: 'guild-1',
  getEconomy: vi.fn(),
  getItems: vi.fn(),
  getRoles: vi.fn(),
  useEnable: vi.fn(),
  useDisable: vi.fn(),
  usePause: vi.fn(),
  useResume: vi.fn(),
  useCreateItem: vi.fn(),
  useUpdateItem: vi.fn(),
  useDeleteItem: vi.fn(),
  useDeleteChannels: vi.fn(),
  refetchItems: vi.fn(),
  refetchRoles: vi.fn(),
  enable: vi.fn(),
  disable: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  createItem: vi.fn(),
  updateItem: vi.fn(),
  deleteItem: vi.fn(),
  deleteChannels: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ guildId: mocks.guildId }),
}));

vi.mock('@/store/api', () => ({
  useGetEconomyQuery: mocks.getEconomy,
  useGetEconomyItemsQuery: mocks.getItems,
  useGetEconomyRolesQuery: mocks.getRoles,
  useEnableEconomyMutation: mocks.useEnable,
  useDisableEconomyMutation: mocks.useDisable,
  usePauseEconomyMutation: mocks.usePause,
  useResumeEconomyMutation: mocks.useResume,
  useCreateEconomyItemMutation: mocks.useCreateItem,
  useUpdateEconomyItemMutation: mocks.useUpdateItem,
  useDeleteEconomyItemMutation: mocks.useDeleteItem,
  useDeleteEconomyChannelsMutation: mocks.useDeleteChannels,
}));

const economyData = {
  settings: { currencyName: 'Dex', economyName: 'Dex Economy' },
  state: {
    enabled: true,
    paused: false,
    channels: {},
    missing: [],
    walletCount: 2,
  },
};

const defaultItem = {
  id: 1,
  guildId: 'guild-1',
  itemId: 'shield',
  kind: 'shield',
  name: 'Shield',
  description: 'Blocks two robbery attempts.',
  price: 150,
  roleId: null,
  stock: null,
  enabled: true,
  isDefault: true,
  sortOrder: 0,
};

const roleItem = {
  id: 2,
  guildId: 'guild-1',
  itemId: 'community-role',
  kind: 'role',
  name: 'Community role',
  description: 'Purchasable server role: Community role',
  price: 500,
  roleId: 'role-2',
  stock: null,
  enabled: true,
  isDefault: false,
  sortOrder: 1,
};

describe('EconomyPage', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    mocks.getEconomy.mockReturnValue({ data: economyData, isLoading: false });
    mocks.getItems.mockReturnValue({
      data: { items: [defaultItem] },
      isLoading: false,
      refetch: mocks.refetchItems,
    });
    mocks.getRoles.mockReturnValue({
      data: { roles: [{ id: 'role-1', name: 'Community', position: 1, color: 123, reason: null }] },
      isLoading: false,
      refetch: mocks.refetchRoles,
    });
    mocks.refetchItems.mockReturnValue({ unwrap: () => Promise.resolve({ items: [defaultItem] }) });
    mocks.refetchRoles.mockReturnValue({ unwrap: () => Promise.resolve({ roles: [] }) });
    mocks.enable.mockReturnValue({ unwrap: () => Promise.resolve({ ok: true }) });
    mocks.disable.mockReturnValue({ unwrap: () => Promise.resolve({ ok: true }) });
    mocks.pause.mockReturnValue({ unwrap: () => Promise.resolve({ ok: true }) });
    mocks.resume.mockReturnValue({ unwrap: () => Promise.resolve({ ok: true }) });
    mocks.createItem.mockReturnValue({ unwrap: () => Promise.resolve({ ok: true }) });
    mocks.updateItem.mockReturnValue({ unwrap: () => Promise.resolve({ ok: true }) });
    mocks.deleteItem.mockReturnValue({ unwrap: () => Promise.resolve({ ok: true }) });
    mocks.deleteChannels.mockReturnValue({ unwrap: () => Promise.resolve({ ok: true }) });
    mocks.useEnable.mockReturnValue([mocks.enable, { isLoading: false }]);
    mocks.useDisable.mockReturnValue([mocks.disable, { isLoading: false }]);
    mocks.usePause.mockReturnValue([mocks.pause]);
    mocks.useResume.mockReturnValue([mocks.resume]);
    mocks.useCreateItem.mockReturnValue([mocks.createItem, { isLoading: false }]);
    mocks.useUpdateItem.mockReturnValue([mocks.updateItem]);
    mocks.useDeleteItem.mockReturnValue([mocks.deleteItem]);
    mocks.useDeleteChannels.mockReturnValue([mocks.deleteChannels]);
  });

  it('uses the Economy page skeleton during initial load', () => {
    mocks.getEconomy.mockReturnValue({ isLoading: true });
    render(<EconomyPage />);

    expect(screen.getByRole('status', { name: 'Loading Economy configuration' })).toBeTruthy();
  });

  it('keeps economy controls but hides built-in store items and economy tuning fields', () => {
    render(<EconomyPage />);

    expect(screen.getByRole('switch', { name: 'Enable Economy' })).toBeTruthy();
    expect(screen.queryByText('Shield')).toBeNull();
    expect(screen.queryByLabelText('Shield price')).toBeNull();
    expect(screen.getByText('No server roles have been added to the store yet.')).toBeTruthy();
    expect(screen.queryByLabelText('Currency name')).toBeNull();
    expect(screen.queryByLabelText('Daily amount')).toBeNull();
    expect(screen.queryByText('Rewards and robberies')).toBeNull();
  });

  it('stages the Economy enable switch until Save and restores it on Discard', () => {
    render(<EconomyPage />);
    const enabledSwitch = screen.getByRole('switch', { name: 'Enable Economy' });

    fireEvent.click(enabledSwitch);
    expect(enabledSwitch.getAttribute('aria-checked')).toBe('false');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeTruthy();
    expect(mocks.disable).not.toHaveBeenCalled();

    const saveBar = screen.getByText('Unsaved changes').parentElement;
    expect(saveBar?.classList.contains('items-center')).toBe(true);
    expect(saveBar?.classList.contains('flex-wrap')).toBe(false);
    expect(saveBar?.classList.contains('justify-center')).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(enabledSwitch.getAttribute('aria-checked')).toBe('true');
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
    expect(mocks.disable).not.toHaveBeenCalled();
  });

  it('enables Economy only when the staged change is saved', async () => {
    mocks.getEconomy.mockReturnValue({
      data: {
        ...economyData,
        state: { ...economyData.state, enabled: false },
      },
      isLoading: false,
    });
    render(<EconomyPage />);
    fireEvent.click(screen.getByRole('switch', { name: 'Enable Economy' }));
    expect(mocks.enable).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(mocks.enable).toHaveBeenCalledWith('guild-1'));
  });

  it('disables Economy only when the staged change is saved', async () => {
    render(<EconomyPage />);
    fireEvent.click(screen.getByRole('switch', { name: 'Enable Economy' }));
    expect(mocks.disable).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(mocks.disable).toHaveBeenCalledWith('guild-1'));
  });

  it('retains the Economy enable draft when setup reports a failure', async () => {
    mocks.getEconomy.mockReturnValue({
      data: {
        ...economyData,
        state: { ...economyData.state, enabled: false },
      },
      isLoading: false,
    });
    mocks.enable.mockReturnValue({
      unwrap: () => Promise.resolve({ ok: false, message: 'Missing bot permissions.' }),
    });
    render(<EconomyPage />);
    fireEvent.click(screen.getByRole('switch', { name: 'Enable Economy' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Save changes' })).toBeTruthy());
    expect(screen.getByRole('switch', { name: 'Enable Economy' }).getAttribute('aria-checked')).toBe('true');
  });

  it('stages pause and resume until Save changes', async () => {
    render(<EconomyPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));

    expect(mocks.pause).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(mocks.pause).toHaveBeenCalledWith('guild-1'));
  });

  it('keeps Economy content visible while store role listings load', () => {
    mocks.getItems.mockReturnValue({
      isLoading: true,
      refetch: mocks.refetchItems,
    });
    render(<EconomyPage />);

    expect(screen.getByRole('heading', { name: 'Economy' })).toBeTruthy();
    expect(screen.getByText('2 wallet(s)')).toBeTruthy();
    expect(screen.getByRole('status', { name: 'Loading server role listings' })).toBeTruthy();
  });

  it('stages a safe server role and adds it only after Save changes', async () => {
    render(<EconomyPage />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Server role' }), { target: { value: 'role-1' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Price (Dex)' }), { target: { value: '1200' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add role to store' }));

    expect(mocks.createItem).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeTruthy();
    expect(screen.getByText(/Community — 1,200 Dex/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(mocks.createItem).toHaveBeenCalledWith({
      guildId: 'guild-1',
      item: {
        kind: 'role',
        name: 'Community',
        description: 'Purchasable server role: Community',
        price: 1200,
        roleId: 'role-1',
        enabled: true,
      },
    }));
  });

  it('shows Save changes as soon as the new-role form is edited and Discard resets it', () => {
    render(<EconomyPage />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Server role' }), { target: { value: 'role-1' } });

    expect(screen.getByRole('button', { name: 'Save changes' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));

    expect((screen.getByRole('combobox', { name: 'Server role' }) as HTMLSelectElement).value).toBe('');
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
    expect(mocks.createItem).not.toHaveBeenCalled();
  });

  it('shows local add-role validation inline and focuses the invalid price', async () => {
    render(<EconomyPage />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Server role' }), { target: { value: 'role-1' } });
    const priceInput = screen.getByRole('spinbutton', { name: 'Price (Dex)' }) as HTMLInputElement;
    fireEvent.change(priceInput, { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add role to store' }));

    expect(await screen.findByText('Enter a whole-number price between 1 and 1,000,000 Dex.')).toBeTruthy();
    expect(priceInput.getAttribute('aria-invalid')).toBe('true');
    await waitFor(() => expect(document.activeElement).toBe(priceInput));
    expect(mocks.createItem).not.toHaveBeenCalled();
  });

  it('saves staged role prices with a Save changes action', async () => {
    const updatedRoleItem = { ...roleItem, price: 1200 };
    mocks.getItems.mockReturnValue({
      data: { items: [defaultItem, roleItem] },
      isLoading: false,
      refetch: mocks.refetchItems,
    });
    mocks.refetchItems.mockImplementation(() => {
      mocks.getItems.mockReturnValue({
        data: { items: [defaultItem, updatedRoleItem] },
        isLoading: false,
        refetch: mocks.refetchItems,
      });
      return { unwrap: () => Promise.resolve({ items: [defaultItem, updatedRoleItem] }) };
    });

    render(<EconomyPage />);
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Community role price' }), { target: { value: '1200' } });

    expect(mocks.updateItem).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(mocks.updateItem).toHaveBeenCalledWith({
      guildId: 'guild-1',
      itemId: 'community-role',
      item: { price: 1200 },
    }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull());
  });

  it('discards staged role changes without sending an API request', () => {
    mocks.getItems.mockReturnValue({
      data: { items: [defaultItem, roleItem] },
      isLoading: false,
      refetch: mocks.refetchItems,
    });
    render(<EconomyPage />);

    const priceInput = screen.getByRole('spinbutton', { name: 'Community role price' }) as HTMLInputElement;
    fireEvent.change(priceInput, { target: { value: '1200' } });
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));

    expect(priceInput.value).toBe('500');
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
    expect(mocks.updateItem).not.toHaveBeenCalled();
  });

  it('stages role deletion for Save or Discard instead of deleting immediately', () => {
    mocks.getItems.mockReturnValue({
      data: { items: [defaultItem, roleItem] },
      isLoading: false,
      refetch: mocks.refetchItems,
    });
    render(<EconomyPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Delete Community role' }));
    expect(mocks.deleteItem).not.toHaveBeenCalled();
    expect(screen.getByText('Marked for deletion when you save.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(screen.queryByText('Marked for deletion when you save.')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
    expect(mocks.deleteItem).not.toHaveBeenCalled();
  });

  it('deletes a staged role only after Save changes', async () => {
    mocks.getItems.mockReturnValue({
      data: { items: [defaultItem, roleItem] },
      isLoading: false,
      refetch: mocks.refetchItems,
    });
    render(<EconomyPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Delete Community role' }));
    expect(mocks.deleteItem).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(mocks.deleteItem).toHaveBeenCalledWith({
      guildId: 'guild-1',
      itemId: 'community-role',
    }));
  });

  it('keeps a failed role deletion staged for retry or discard', async () => {
    mocks.getItems.mockReturnValue({
      data: { items: [defaultItem, roleItem] },
      isLoading: false,
      refetch: mocks.refetchItems,
    });
    mocks.deleteItem.mockReturnValue({
      unwrap: () => Promise.reject({ status: 500, data: { message: 'Delete failed.' } }),
    });
    render(<EconomyPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Delete Community role' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Marked for deletion when you save.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeTruthy();
  });

  it('stages Economy channel deletion and applies it only after Save', async () => {
    vi.stubGlobal('confirm', () => true);
    render(<EconomyPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Delete economy channels' }));
    expect(mocks.deleteChannels).not.toHaveBeenCalled();
    expect(screen.getByText(/Channel deletion is pending/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(mocks.deleteChannels).toHaveBeenCalledWith('guild-1'));
  });

  it('shows backend role-creation validation issues on the matching field', async () => {
    mocks.createItem.mockReturnValue({
      unwrap: () => Promise.reject({
        status: 400,
        data: {
          message: 'Validation failed',
          issues: [{ path: 'price', message: 'Price is above the allowed maximum.' }],
        },
      }),
    });
    render(<EconomyPage />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Server role' }), { target: { value: 'role-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Price is above the allowed maximum.')).toBeTruthy();
    expect(screen.getByRole('spinbutton', { name: 'Price (Dex)' }).getAttribute('aria-invalid')).toBe('true');
  });

  it('shows local role-price validation inline and focuses the invalid field', async () => {
    mocks.getItems.mockReturnValue({
      data: { items: [defaultItem, roleItem] },
      isLoading: false,
      refetch: mocks.refetchItems,
    });
    render(<EconomyPage />);
    const priceInput = screen.getByRole('spinbutton', { name: 'Community role price' }) as HTMLInputElement;
    fireEvent.change(priceInput, { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Enter a whole-number price between 1 and 1,000,000 Dex.')).toBeTruthy();
    expect(priceInput.getAttribute('aria-invalid')).toBe('true');
    await waitFor(() => expect(document.activeElement).toBe(priceInput));
    expect(mocks.updateItem).not.toHaveBeenCalled();
  });

  it('shows store query errors and retries the failed request', () => {
    mocks.getItems.mockReturnValue({
      error: { status: 500, data: { message: 'Store items are unavailable.' } },
      isLoading: false,
      isFetching: false,
      refetch: mocks.refetchItems,
    });
    render(<EconomyPage />);

    expect(screen.getByText('Store items are unavailable.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(mocks.refetchItems).toHaveBeenCalled();
  });
});
