'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
import { AlertTriangle, Pause, Play, RotateCcw, Save, Store, Trash2, type LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader, StatusPill } from '@/components/dashboard/ui';
import { EconomySkeleton } from '@/components/dashboard/loading-skeleton';
import { Badge, Card, Field, Skeleton } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { errorBody, errorMessage, isRateLimited, issuesByPath } from '@/lib/errors';
import type { EconomyItem, EconomyState } from '@/lib/types';
import { cn } from '@/lib/utils';
import {
  useCreateEconomyItemMutation,
  useDeleteEconomyChannelsMutation,
  useDeleteEconomyItemMutation,
  useDisableEconomyMutation,
  useEnableEconomyMutation,
  useGetEconomyItemsQuery,
  useGetEconomyQuery,
  useGetEconomyRolesQuery,
  usePauseEconomyMutation,
  useResumeEconomyMutation,
  useUpdateEconomyItemMutation,
} from '@/store/api';

function Section({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: React.ReactNode }) {
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center gap-2">
        <Icon className="size-4 text-primary" aria-hidden="true" />
        <h2 className="font-medium">{title}</h2>
      </div>
      {children}
    </Card>
  );
}

type RoleItemDraft = { price?: string; enabled?: boolean };
type PendingRoleAdd = { roleId: string; name: string; price: number };

function fieldIssue(issues: Record<string, string>, field: string) {
  return Object.entries(issues).find(([path]) => path === field || path.endsWith(`.${field}`))?.[1];
}

function priceProblem(price: number) {
  return Number.isSafeInteger(price) && price >= 1 && price <= 1_000_000
    ? null
    : 'Enter a whole-number price between 1 and 1,000,000 Dex.';
}

export default function EconomyPage() {
  const { guildId } = useParams<{ guildId: string }>();
  const { data, isLoading, error, isFetching, refetch } = useGetEconomyQuery(guildId);
  if (isLoading) return <EconomySkeleton />;
  if (error) {
    return (
      <Card className="p-6" role="alert">
        <h1 className="font-semibold">Could not load Economy</h1>
        <p className="mt-2 text-sm text-muted-foreground">{errorMessage(error, 'Could not load Economy. Try again.')}</p>
        <Button className="mt-4" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? 'Retrying…' : 'Try again'}
        </Button>
      </Card>
    );
  }
  if (!data) {
    return (
      <Card className="p-6" role="alert">
        <h1 className="font-semibold">Economy data unavailable</h1>
        <p className="mt-2 text-sm text-muted-foreground">The server returned no Economy settings. Try loading them again.</p>
        <Button className="mt-4" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? 'Retrying…' : 'Try again'}
        </Button>
      </Card>
    );
  }
  return <EconomyEditor key={guildId} guildId={guildId} initialData={data} />;
}

function EconomyEditor({
  guildId,
  initialData,
}: {
  guildId: string;
  initialData: { state: EconomyState };
}) {
  const data = initialData;
  const { data: itemsData, isLoading: itemsLoading, error: itemsError, isFetching: itemsFetching, refetch: refetchItems } = useGetEconomyItemsQuery(guildId);
  const { data: rolesData, isLoading: rolesLoading, error: rolesError, isFetching: rolesFetching, refetch: refetchRoles } = useGetEconomyRolesQuery(guildId);
  const [enableEconomy] = useEnableEconomyMutation();
  const [disableEconomy] = useDisableEconomyMutation();
  const [pauseEconomy] = usePauseEconomyMutation();
  const [resumeEconomy] = useResumeEconomyMutation();
  const [createItem] = useCreateEconomyItemMutation();
  const [updateItem] = useUpdateEconomyItemMutation();
  const [deleteItem] = useDeleteEconomyItemMutation();
  const [deleteChannels] = useDeleteEconomyChannelsMutation();
  const [roleItemDrafts, setRoleItemDrafts] = useState<Record<string, RoleItemDraft>>({});
  const [pendingRoleDeletes, setPendingRoleDeletes] = useState<Record<string, boolean>>({});
  const [pendingRoleAdds, setPendingRoleAdds] = useState<PendingRoleAdd[]>([]);
  const [savingChanges, setSavingChanges] = useState(false);
  const state = data.state;
  const [enabledDraft, setEnabledDraft] = useState<boolean | null>(null);
  const [pausedDraft, setPausedDraft] = useState<boolean | null>(null);
  const [pendingChannelDeletion, setPendingChannelDeletion] = useState(false);
  const [roleId, setRoleId] = useState('');
  const [rolePrice, setRolePrice] = useState('100');
  const [roleCreationIssues, setRoleCreationIssues] = useState<Record<string, string>>({});
  const [roleItemIssues, setRoleItemIssues] = useState<Record<string, string>>({});
  const availableRoles = useMemo(() => {
    const listedRoleIds = new Set((itemsData?.items ?? [])
      .filter((item) => item.kind === 'role' && item.roleId)
      .map((item) => item.roleId));
    const pendingRoleIds = new Set(pendingRoleAdds.map((item) => item.roleId));
    return (rolesData?.roles ?? []).filter((role) => (
      !role.reason && !listedRoleIds.has(role.id) && !pendingRoleIds.has(role.id)
    ));
  }, [itemsData?.items, pendingRoleAdds, rolesData?.roles]);
  const roleItems = useMemo(
    () => (itemsData?.items ?? []).filter((item) => item.kind === 'role' && !item.isDefault),
    [itemsData?.items],
  );
  const roleItemsToDelete = useMemo(
    () => roleItems.filter((item) => pendingRoleDeletes[item.itemId]),
    [pendingRoleDeletes, roleItems],
  );
  const dirtyRoleItems = useMemo(() => roleItems.filter((item) => {
    if (pendingRoleDeletes[item.itemId]) return false;
    const draft = roleItemDrafts[item.itemId];
    return !!draft && (
      (draft.price !== undefined && Number(draft.price) !== item.price)
      || (draft.enabled !== undefined && draft.enabled !== item.enabled)
    );
  }), [pendingRoleDeletes, roleItems, roleItemDrafts]);
  const enabledChanged = enabledDraft !== null && enabledDraft !== state.enabled;
  const pausedChanged = pausedDraft !== null && pausedDraft !== state.paused;
  const hasUnsavedChanges = dirtyRoleItems.length > 0
    || roleItemsToDelete.length > 0
    || pendingRoleAdds.length > 0
    || !!roleId
    || rolePrice !== '100'
    || enabledChanged
    || pausedChanged
    || pendingChannelDeletion;

  useEffect(() => {
    if (enabledDraft !== null && enabledDraft === state.enabled) setEnabledDraft(null);
  }, [enabledDraft, state.enabled]);

  useEffect(() => {
    if (pausedDraft !== null && pausedDraft === state.paused) setPausedDraft(null);
  }, [pausedDraft, state.paused]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasUnsavedChanges]);

  function stageRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRoleCreationIssues({});
    const role = availableRoles.find((item) => item.id === roleId);
    const price = Number(rolePrice);
    if (!role) {
      setRoleCreationIssues({ roleId: 'Choose an available server role.' });
      requestAnimationFrame(() => document.getElementById('economy-role-id')?.focus());
      toast.error('Choose an available server role.');
      return;
    }
    const problem = priceProblem(price);
    if (problem) {
      setRoleCreationIssues({ price: problem });
      requestAnimationFrame(() => document.getElementById('economy-role-price')?.focus());
      toast.error(problem);
      return;
    }
    setPendingRoleAdds((current) => [...current, { roleId: role.id, name: role.name, price }]);
    setRoleId('');
    setRolePrice('100');
    setRoleCreationIssues({});
    toast.success(`${role.name} staged; save changes to add it to the store`);
  }

  function patchRoleItem(itemId: string, patch: RoleItemDraft) {
    setRoleItemDrafts((current) => ({
      ...current,
      [itemId]: { ...current[itemId], ...patch },
    }));
    setRoleItemIssues((current) => {
      const next = { ...current };
      delete next[itemId];
      return next;
    });
  }

  function stageRoleDeletion(itemId: string) {
    setPendingRoleDeletes((current) => ({ ...current, [itemId]: true }));
  }

  function restoreRole(itemId: string) {
    setPendingRoleDeletes((current) => {
      const next = { ...current };
      delete next[itemId];
      return next;
    });
  }

  async function saveChanges(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRoleItemIssues({});
    setRoleCreationIssues({});
    const updates: Array<{ itemId: string; name: string; item: Partial<EconomyItem> }> = [];
    const localIssues: Record<string, string> = {};
    const additions = [...pendingRoleAdds];
    const deletions = [...roleItemsToDelete];
    if (roleId) {
      const role = availableRoles.find((item) => item.id === roleId);
      const price = Number(rolePrice);
      if (!role) {
        setRoleCreationIssues({ roleId: 'Choose an available server role.' });
        requestAnimationFrame(() => document.getElementById('economy-role-id')?.focus());
        toast.error('Choose an available server role.');
        return;
      }
      const problem = priceProblem(price);
      if (problem) {
        setRoleCreationIssues({ price: problem });
        requestAnimationFrame(() => document.getElementById('economy-role-price')?.focus());
        toast.error(problem);
        return;
      }
      additions.push({ roleId: role.id, name: role.name, price });
    } else if (rolePrice !== '100') {
      setRoleCreationIssues({ roleId: 'Choose a server role before saving its price.' });
      requestAnimationFrame(() => document.getElementById('economy-role-id')?.focus());
      toast.error('Choose a server role before saving its price.');
      return;
    }

    for (const storeItem of dirtyRoleItems) {
      const draft = roleItemDrafts[storeItem.itemId];
      const price = draft?.price === undefined ? storeItem.price : Number(draft.price);
      const problem = priceProblem(price);
      if (problem) localIssues[storeItem.itemId] = problem;
      const item: Partial<EconomyItem> = {};
      if (price !== storeItem.price) item.price = price;
      const enabled = draft?.enabled ?? storeItem.enabled;
      if (enabled !== storeItem.enabled) item.enabled = enabled;
      if (!problem && Object.keys(item).length > 0) updates.push({ itemId: storeItem.itemId, name: storeItem.name, item });
    }

    if (Object.keys(localIssues).length > 0) {
      setRoleItemIssues(localIssues);
      toast.error('Fix the highlighted fields and try again.');
      requestAnimationFrame(() => document.getElementById(`economy-role-price-${Object.keys(localIssues)[0]}`)?.focus());
      return;
    }

    const hasRoleChanges = updates.length > 0 || additions.length > 0 || deletions.length > 0;
    if (!hasRoleChanges && !enabledChanged && !pausedChanged && !pendingChannelDeletion) {
      setRoleItemDrafts({});
      return;
    }

    setSavingChanges(true);
    try {
      if (enabledChanged && enabledDraft !== null) {
        if (enabledDraft) {
          const result = await enableEconomy(guildId).unwrap();
          if (!result.ok) {
            toast.error(result.message || 'Could not enable Economy.');
            return;
          }
          toast.success(result.message || 'Economy enabled');
        } else {
          await disableEconomy(guildId).unwrap();
          toast.success('Economy disabled');
        }
        setEnabledDraft(null);
      }

      if (pausedChanged && pausedDraft !== null) {
        if (pausedDraft) {
          await pauseEconomy(guildId).unwrap();
          toast.success('Economy paused');
        } else {
          await resumeEconomy(guildId).unwrap();
          toast.success('Economy resumed');
        }
        setPausedDraft(null);
      }

      const results = await Promise.allSettled(
        [
          ...updates.map(({ itemId, item }) => updateItem({ guildId, itemId, item }).unwrap()),
          ...additions.map(({ roleId: newRoleId, name, price }) => createItem({
            guildId,
            item: {
              kind: 'role',
              name,
              description: `Purchasable server role: ${name}`,
              price,
              roleId: newRoleId,
              enabled: true,
            },
          }).unwrap()),
          ...deletions.map(({ itemId }) => deleteItem({ guildId, itemId }).unwrap()),
        ],
      );
      const savedItemIds = new Set(results.flatMap((result, index) => (
        result.status === 'fulfilled' && index < updates.length ? [updates[index].itemId] : []
      )));
      const savedRoleIds = new Set(results.flatMap((result, index) => (
        result.status === 'fulfilled' && index >= updates.length && index < updates.length + additions.length
          ? [additions[index - updates.length].roleId]
          : []
      )));
      const savedDeletedIds = new Set(results.flatMap((result, index) => (
        result.status === 'fulfilled' && index >= updates.length + additions.length
          ? [deletions[index - updates.length - additions.length].itemId]
          : []
      )));
      const failedCount = results.filter((result) => result.status === 'rejected').length;
      const nextIssues: Record<string, string> = {};
      let nextCreationIssues: Record<string, string> = {};
      const requestErrors: string[] = [];
      results.forEach((result, index) => {
        if (result.status !== 'rejected' || isRateLimited(result.reason)) return;
        const byPath = issuesByPath(errorBody(result.reason));
        const priceIssue = fieldIssue(byPath, 'price');
        if (index < updates.length && priceIssue) {
          nextIssues[updates[index].itemId] = priceIssue;
        } else if (
          index >= updates.length
          && index < updates.length + additions.length
          && additions[index - updates.length].roleId === roleId
          && Object.keys(byPath).length > 0
        ) {
          nextCreationIssues = byPath;
        } else {
          const itemName = index < updates.length
            ? updates[index].name
            : index < updates.length + additions.length
              ? additions[index - updates.length].name
              : deletions[index - updates.length - additions.length].name;
          const fallback = index < updates.length + additions.length
            ? `Could not save ${itemName}.`
            : `Could not delete ${itemName}.`;
          requestErrors.push(errorMessage(result.reason, fallback));
        }
      });
      setRoleItemIssues(nextIssues);
      setRoleCreationIssues(nextCreationIssues);

      setRoleItemDrafts((current) => Object.fromEntries(
        Object.entries(current).filter(([itemId]) => !savedItemIds.has(itemId) && !savedDeletedIds.has(itemId)),
      ));
      setPendingRoleDeletes((current) => Object.fromEntries(
        Object.entries(current).filter(([itemId]) => !savedDeletedIds.has(itemId)),
      ));
      setPendingRoleAdds(additions.filter((item) => (
        !savedRoleIds.has(item.roleId) && item.roleId !== roleId
      )));
      if (roleId && savedRoleIds.has(roleId)) {
        setRoleId('');
        setRolePrice('100');
        setRoleCreationIssues({});
      }
      if (Object.keys(nextCreationIssues).length > 0) {
        const firstIssue = Object.keys(nextCreationIssues)[0].split('.').pop();
        const fieldId = firstIssue === 'roleId' ? 'economy-role-id' : firstIssue === 'price' ? 'economy-role-price' : null;
        if (fieldId) requestAnimationFrame(() => document.getElementById(fieldId)?.focus());
      }

      let refreshFailed = false;
      if (hasRoleChanges) {
        try {
          await refetchItems().unwrap();
        } catch (refreshError) {
          refreshFailed = true;
          if (!isRateLimited(refreshError)) {
            toast.error(errorMessage(refreshError, 'Role changes may be saved, but the store could not be refreshed.'));
          }
        }
      }

      if (failedCount > 0) {
        if (Object.keys(nextIssues).length > 0) toast.error('Fix the highlighted fields and try again.');
        for (const message of requestErrors) toast.error(message);
        return;
      }

      setRoleItemDrafts({});
      setPendingRoleAdds([]);
      if (hasRoleChanges && !refreshFailed) toast.success('Role changes saved');

      if (pendingChannelDeletion) {
        try {
          await deleteChannels(guildId).unwrap();
          setPendingChannelDeletion(false);
          toast.success('Economy channels deleted');
        } catch (deleteError) {
          if (!isRateLimited(deleteError)) {
            toast.error(errorMessage(deleteError, 'Could not delete Economy channels.'));
          }
        }
      }
    } catch (saveError) {
      if (!isRateLimited(saveError)) toast.error(errorMessage(saveError, 'Could not save Economy changes.'));
    } finally {
      setSavingChanges(false);
    }
  }

  function deleteEconomyChannels() {
    if (!window.confirm('Mark the economy channels for deletion? Click Save changes to delete them. Wallet data and transactions will be kept.')) return;
    setPendingChannelDeletion(true);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Economy"
        description="Manage the economy and set Dex prices for purchasable server roles."
        right={
          <>
            <StatusPill on={enabledDraft ?? state.enabled} />
            <Switch
              aria-label="Enable Economy"
              checked={enabledDraft ?? state.enabled}
              onCheckedChange={(nextEnabled) => setEnabledDraft(nextEnabled === state.enabled ? null : nextEnabled)}
              disabled={savingChanges}
            />
          </>
        }
      />

      <Section icon={Store} title="Status">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {(pausedDraft ?? state.paused) && <Badge tone="warning">Paused</Badge>}
            <span className="text-sm text-muted-foreground">{state.walletCount} wallet(s)</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {state.enabled && (
              <Button
                variant="secondary"
                disabled={savingChanges}
                onClick={() => setPausedDraft((current) => {
                  const next = !(current ?? state.paused);
                  return next === state.paused ? null : next;
                })}
              >
                {(pausedDraft ?? state.paused) ? <Play className="size-4" /> : <Pause className="size-4" />}
                {(pausedDraft ?? state.paused) ? 'Resume' : 'Pause'}
              </Button>
            )}
          </div>
        </div>
        {state.missing.length > 0 && (
          <div className="mt-4 flex gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm" role="status">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
            <span>Missing setup pieces: {state.missing.join(', ')}</span>
          </div>
        )}
      </Section>

      <Section icon={Store} title="Store manager">
        <p className="mb-4 text-sm text-muted-foreground">
          Built-in store items stay available in Discord and are not editable here. This dashboard manages purchasable server roles.
        </p>
        {itemsError && (
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm" role="alert">
            <span className="text-destructive">{errorMessage(itemsError, 'Could not load store items.')}</span>
            <Button type="button" size="sm" variant="secondary" onClick={() => refetchItems()} disabled={itemsFetching}>
              {itemsFetching ? 'Retrying…' : 'Try again'}
            </Button>
          </div>
        )}
        {rolesData?.roles.some((role) => role.reason) && (
          <p className="mb-3 text-xs text-muted-foreground">Roles that the bot cannot safely assign are unavailable for purchase.</p>
        )}
        {rolesError && (
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm" role="alert">
            <span className="text-destructive">{errorMessage(rolesError, 'Could not load server roles.')}</span>
            <Button type="button" size="sm" variant="secondary" onClick={() => refetchRoles()} disabled={rolesFetching}>
              {rolesFetching ? 'Retrying…' : 'Try again'}
            </Button>
          </div>
        )}
        <form className="mb-5 grid gap-4 rounded-lg border border-border p-4 sm:grid-cols-[1fr_180px_auto] sm:items-end" aria-labelledby="economy-add-role-heading" noValidate onSubmit={stageRole}>
          <div className="sm:col-span-3">
            <h3 id="economy-add-role-heading" className="text-sm font-medium">Add a purchasable server role</h3>
            <p className="mt-1 text-xs text-muted-foreground">Choose a safe server role and set its price in Dex. The store message updates when you add it.</p>
          </div>
          <Field label="Server role" htmlFor="economy-role-id">
            <Select
              id="economy-role-id"
              name="roleId"
              required
              value={roleId}
              aria-invalid={!!fieldIssue(roleCreationIssues, 'roleId')}
              aria-describedby={fieldIssue(roleCreationIssues, 'roleId') ? 'economy-role-id-error' : undefined}
              disabled={savingChanges || rolesLoading || itemsLoading || !!rolesError || !!itemsError || availableRoles.length === 0}
              onChange={(event) => {
                setRoleId(event.target.value);
                setRoleCreationIssues((current) => {
                  const next = { ...current };
                  delete next.roleId;
                  return next;
                });
              }}
            >
              <option value="" disabled>Choose a role</option>
              {availableRoles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
            </Select>
            {fieldIssue(roleCreationIssues, 'roleId') && (
              <p id="economy-role-id-error" className="mt-1 text-xs text-destructive">
                {fieldIssue(roleCreationIssues, 'roleId')}
              </p>
            )}
          </Field>
          <Field label="Price (Dex)" htmlFor="economy-role-price">
            <Input
              id="economy-role-price"
              name="price"
              type="number"
              inputMode="numeric"
              min={1}
              max={1_000_000}
              step={1}
              required
              value={rolePrice}
              disabled={savingChanges}
              aria-invalid={!!fieldIssue(roleCreationIssues, 'price')}
              aria-describedby={fieldIssue(roleCreationIssues, 'price') ? 'economy-role-price-error' : undefined}
              onChange={(event) => {
                setRolePrice(event.target.value);
                setRoleCreationIssues((current) => {
                  const next = { ...current };
                  delete next.price;
                  return next;
                });
              }}
            />
            {fieldIssue(roleCreationIssues, 'price') && (
              <p id="economy-role-price-error" className="mt-1 text-xs text-destructive">
                {fieldIssue(roleCreationIssues, 'price')}
              </p>
            )}
          </Field>
          <Button type="submit" disabled={savingChanges || rolesLoading || itemsLoading || !!rolesError || !!itemsError || availableRoles.length === 0}>
            Add role to store
          </Button>
        </form>
        {itemsLoading && (
          <div className="mb-4 space-y-2" aria-busy="true" aria-label="Loading server role listings" role="status">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        )}
        {pendingRoleAdds.length > 0 && (
          <ul className="mb-4 space-y-2" aria-label="Roles pending addition">
            {pendingRoleAdds.map((item) => (
              <li key={item.roleId} className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-border p-3 text-sm">
                <span>{item.name} — {item.price.toLocaleString()} Dex <span className="text-muted-foreground">(pending)</span></span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label={`Remove pending ${item.name}`}
                  disabled={savingChanges}
                  onClick={() => setPendingRoleAdds((current) => current.filter((pending) => pending.roleId !== item.roleId))}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
        <form
          id="economy-role-items-form"
          className="space-y-2"
          aria-labelledby="economy-role-items-heading"
          noValidate
          onSubmit={(event) => void saveChanges(event)}
        >
          <h3 id="economy-role-items-heading" className="text-sm font-medium">Added server roles</h3>
          {!itemsError && !itemsLoading && roleItems.map((item) => {
            const draft = roleItemDrafts[item.itemId];
            const price = draft?.price ?? String(item.price);
            const enabled = draft?.enabled ?? item.enabled;
            const priceIssue = roleItemIssues[item.itemId];
            const deletionPending = !!pendingRoleDeletes[item.itemId];
            return (
              <div
                key={item.itemId}
                className={cn(
                  'grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-[1fr_110px_100px_auto] sm:items-center',
                  deletionPending && 'border-destructive/40 bg-destructive/5',
                )}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{item.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{item.description || 'Server role'}</p>
                  {deletionPending && <p className="mt-1 text-xs text-destructive">Marked for deletion when you save.</p>}
                </div>
                <div>
                  <Input
                    id={`economy-role-price-${item.itemId}`}
                    aria-label={`${item.name} price`}
                    aria-invalid={!!priceIssue}
                    aria-describedby={priceIssue ? `economy-role-price-${item.itemId}-error` : undefined}
                    name={`price-${item.itemId}`}
                    type="number"
                    min={1}
                    max={1_000_000}
                    step={1}
                    required
                    value={price}
                    disabled={savingChanges || deletionPending}
                    onChange={(event) => patchRoleItem(item.itemId, { price: event.target.value })}
                  />
                  {priceIssue && (
                    <p id={`economy-role-price-${item.itemId}-error`} className="mt-1 text-xs text-destructive">
                      {priceIssue}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    aria-label={`Enable ${item.name}`}
                    checked={enabled}
                    disabled={savingChanges || deletionPending}
                    onCheckedChange={(nextEnabled) => patchRoleItem(item.itemId, { enabled: nextEnabled })}
                  />
                  <span className="text-xs text-muted-foreground">{enabled ? 'On' : 'Off'}</span>
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={deletionPending ? `Restore ${item.name}` : `Delete ${item.name}`}
                  disabled={savingChanges}
                  onClick={() => deletionPending ? restoreRole(item.itemId) : stageRoleDeletion(item.itemId)}
                >
                  {deletionPending
                    ? <RotateCcw className="size-4" aria-hidden="true" />
                    : <Trash2 className="size-4" aria-hidden="true" />}
                </Button>
              </div>
            );
          })}
          {!itemsError && !itemsLoading && roleItems.length === 0 && (
            <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
              No server roles have been added to the store yet.
            </p>
          )}
        </form>
      </Section>

      {state.enabled && (
        <Section icon={AlertTriangle} title="Danger zone">
          <p className="mb-3 text-sm text-muted-foreground">Delete economy channels. Wallet data and transactions are kept.</p>
          {pendingChannelDeletion && (
            <p className="mb-3 text-sm text-destructive" role="status">
              Channel deletion is pending. Save to delete the channels; wallet data and transactions will be kept.
            </p>
          )}
          <Button
            variant={pendingChannelDeletion ? 'secondary' : 'destructive'}
            disabled={savingChanges}
            onClick={() => {
              if (pendingChannelDeletion) setPendingChannelDeletion(false);
              else deleteEconomyChannels();
            }}
          >
            {pendingChannelDeletion ? <RotateCcw aria-hidden="true" /> : <Trash2 aria-hidden="true" />}
            {pendingChannelDeletion ? 'Cancel channel deletion' : 'Delete economy channels'}
          </Button>
        </Section>
      )}

      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-20 flex justify-center px-4" aria-live="polite">
<<<<<<< Updated upstream
        <div
          className={cn('pointer-events-auto flex items-center gap-3 rounded-2xl border border-border bg-card/95 px-4 py-2.5 shadow-2xl backdrop-blur transition-all', hasUnsavedChanges ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-4 opacity-0')}
          aria-hidden={!hasUnsavedChanges}
          inert={!hasUnsavedChanges}
        >
=======
        <div className={cn(
          'pointer-events-auto flex flex-wrap items-center justify-center gap-3 rounded-2xl border border-border bg-card/95 px-4 py-2.5 shadow-2xl backdrop-blur transition-all',
          hasUnsavedChanges ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-4 opacity-0',
        )} aria-hidden={!hasUnsavedChanges} inert={!hasUnsavedChanges}>
>>>>>>> Stashed changes
          <span className="text-sm">Unsaved changes</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setRoleItemDrafts({});
              setRoleItemIssues({});
              setPendingRoleDeletes({});
              setPendingRoleAdds([]);
              setRoleId('');
              setRolePrice('100');
              setRoleCreationIssues({});
              setEnabledDraft(null);
              setPausedDraft(null);
              setPendingChannelDeletion(false);
            }}
            disabled={savingChanges}
          >
            <RotateCcw aria-hidden="true" /> Discard
          </Button>
          <Button type="submit" form="economy-role-items-form" size="sm" disabled={savingChanges}>
            <Save aria-hidden="true" /> {savingChanges ? 'Saving…' : 'Save changes'}
          </Button>
<<<<<<< Updated upstream
        </div>
=======
          </div>
>>>>>>> Stashed changes
      </div>
    </div>
  );
}
