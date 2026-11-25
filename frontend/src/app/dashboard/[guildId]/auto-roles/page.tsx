'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, Hash, RotateCcw, Save, Send, ShieldCheck, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { EditorSkeleton } from '@/components/dashboard/loading-skeleton';
import { PageHeader, StatusPill } from '@/components/dashboard/ui';
import { Button } from '@/components/ui/button';
import { Input, Select, Textarea } from '@/components/ui/input';
import { ColorField } from '@/components/editor/color-field';
import { Badge, Card, Field, Skeleton } from '@/components/ui/misc';
import { Switch } from '@/components/ui/switch';
import { DiscordMessageAuthor } from '@/components/preview/discord-preview';
import { LogoMark } from '@/components/logo';
import { errorBody, errorMessage, isRateLimited, issuesByPath } from '@/lib/errors';
import type { AutoRoleConfig } from '@/lib/types';
import {
  useGetAutoRoleActivityQuery,
  useGetChannelsQuery,
  useGetGuildQuery,
  useSaveAutoRolesMutation,
  useTestAutoRolesMutation,
} from '@/store/api';
import { useParams } from 'next/navigation';
import { cn } from '@/lib/utils';

function Section({ title, description, action, children }: { title: string; description?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="font-medium">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </Card>
  );
}

function ToggleRow({ id, label, hint, checked, onChange }: { id: string; label: string; hint?: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <label htmlFor={id} className="text-sm font-medium">{label}</label>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function templateProblems(message: string): string | null {
  if (message.length > 300) return 'Message must be 300 characters or fewer';
  const placeholders = [...message.matchAll(/\{([^{}]*)\}/g)];
  const unknown = placeholders
    .map((match) => match[1])
    .filter((name) => !['user', 'username', 'role', 'server', 'memberCount'].includes(name));
  if (unknown.length) return `Unknown variable {${unknown[0]}}`;
  if (/[{}]/.test(message.replace(/\{([^{}]*)\}/g, ''))) return 'Template variables must use complete braces';
  return null;
}

function validateAutoRoleConfig(
  config: AutoRoleConfig,
  assignableRoleIds: Set<string>,
  channelIds?: Set<string>,
): Record<string, string> {
  const problems: Record<string, string> = {};
  if (config.roleIds.length > 1 || (config.enabled && config.roleIds.length !== 1)) {
    problems.roleIds = 'Choose exactly one role';
  } else if (config.roleIds.some((id) => !/^\d{17,20}$/.test(id)) || (config.roleIds[0] && !assignableRoleIds.has(config.roleIds[0]))) {
    problems.roleIds = 'Choose an assignable role below the bot in the role hierarchy';
  }
  if (config.announce.enabled && !config.announce.channelId) {
    problems['announce.channelId'] = 'Choose an announcement channel';
  } else if (config.announce.channelId && channelIds && !channelIds.has(config.announce.channelId)) {
    problems['announce.channelId'] = 'That channel does not exist in this server';
  }
  const messageProblem = templateProblems(config.announce.message);
  if (messageProblem) problems['announce.message'] = messageProblem;
  if (config.announce.embed.enabled) {
    if (!config.announce.embed.title.trim() && !config.announce.embed.description.trim()) {
      problems['announce.embed.title'] = 'An embed needs a title or a description';
    }
    if (config.announce.embed.title.length > 256) problems['announce.embed.title'] = 'Title must be 256 characters or fewer';
    if (config.announce.embed.description.length > 2000) problems['announce.embed.description'] = 'Description must be 2000 characters or fewer';
    if (config.announce.embed.footer.length > 200) problems['announce.embed.footer'] = 'Footer must be 200 characters or fewer';
  }
  return problems;
}

const FIELD_IDS: Record<string, string> = {
  roleIds: 'auto-role',
  'announce.channelId': 'announcement-channel',
  'announce.message': 'announcement-template',
  'announce.embed.title': 'announcement-embed-title',
  'announce.embed.description': 'announcement-embed-description',
  'announce.embed.footer': 'announcement-embed-footer',
};

function renderPreview(template: string, roleName: string, serverName: string, memberCount: number): ReactNode {
  const parts = template.split(/(\{(?:user|username|role|server|memberCount)\})/g);
  return parts.map((part, index) => {
    if (part === '{user}' || part === '{username}') return <span key={index} className="rounded bg-primary/15 px-1 text-primary">@username</span>;
    if (part === '{role}') return <span key={index} className="font-medium text-foreground">{roleName}</span>;
    if (part === '{server}') return <span key={index} className="font-medium text-foreground">{serverName}</span>;
    if (part === '{memberCount}') return <span key={index} className="font-medium text-foreground">{memberCount}</span>;
    return <span key={index}>{part.replace(/@(everyone|here)\b/gi, '@\u200b$1')}</span>;
  });
}

function relativeTime(value: string): string {
  const delta = Date.now() - Date.parse(value);
  if (!Number.isFinite(delta)) return 'Unknown';
  if (delta < 60_000) return 'just now';
  if (delta < 60 * 60_000) return `${Math.floor(delta / 60_000)}m ago`;
  if (delta < 24 * 60 * 60_000) return `${Math.floor(delta / 3600000)}h ago`;
  return `${Math.floor(delta / 86400000)}d ago`;
}

export default function AutoRolesPage() {
  const { guildId } = useParams<{ guildId: string }>();
  const { data, isLoading } = useGetGuildQuery(guildId);
  const { data: channels, error: channelsError } = useGetChannelsQuery(guildId);
  const { data: activityData, error: activityError, isLoading: activityLoading } = useGetAutoRoleActivityQuery(guildId);
  const [save, { isLoading: saving }] = useSaveAutoRolesMutation();
  const [test, { isLoading: testing }] = useTestAutoRolesMutation();
  const [draft, setDraft] = useState<AutoRoleConfig | null>(null);
  const [saved, setSaved] = useState<AutoRoleConfig | null>(null);
  const [issues, setIssues] = useState<Record<string, string>>({});
  const templateRef = useRef<HTMLTextAreaElement>(null);
  const loadedGuildId = useRef<string | null>(null);

  useEffect(() => {
    if (!data?.autoRoles || data.guild.id !== guildId) return;
    const config = data.autoRoles.config;
    if (loadedGuildId.current !== guildId) {
      loadedGuildId.current = guildId;
      setDraft(config);
      setSaved(config);
      setIssues({});
      return;
    }
    setDraft((current) => current ?? config);
    setSaved((current) => current ?? config);
  }, [data, guildId]);

  useEffect(() => {
    if (!draft) return;
    const warn = (event: BeforeUnloadEvent) => {
      if (JSON.stringify(draft) !== JSON.stringify(saved)) event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [draft, saved]);

  const problems = useMemo(() => {
    if (!draft || !data?.autoRoles) return {};
    const assignableRoleIds = new Set(data.autoRoles.roles.assignable.map((role) => role.id));
    const channelIds = channels ? new Set(channels.map((channel) => channel.id)) : undefined;
    return validateAutoRoleConfig(draft, assignableRoleIds, channelIds);
  }, [draft, data?.autoRoles, channels]);
  const dirty = !!draft && !!saved && JSON.stringify(draft) !== JSON.stringify(saved);
  const hasProblems = Object.keys(problems).length > 0;

  const groupedChannels = useMemo(() => {
    const groups = new Map<string, NonNullable<typeof channels>>();
    for (const item of channels ?? []) {
      const category = item.category ?? 'Uncategorized';
      groups.set(category, [...(groups.get(category) ?? []), item]);
    }
    return [...groups.entries()];
  }, [channels]);

  if (isLoading || !data || data.guild.id !== guildId || loadedGuildId.current !== guildId || !draft) {
    return <EditorSkeleton title="Auto Roles" description="Give new members a role automatically." />;
  }

  const selectedRole = data.autoRoles.roles.assignable.find((role) => role.id === draft.roleIds[0]);
  const roleName = selectedRole?.name ?? 'Member';

  function patch(patchValue: Partial<AutoRoleConfig>) {
    setIssues({});
    setDraft((current) => current ? { ...current, ...patchValue } : current);
  }

  function fieldError(path: string): string | undefined {
    return issues[path] ?? problems[path];
  }

  function focusFirst(found: Record<string, string>) {
    const first = Object.keys(found).find((path) => FIELD_IDS[path]);
    if (first) document.getElementById(FIELD_IDS[first]!)?.focus();
  }

  function insertVariable(variable: string) {
    const el = templateRef.current;
    const value = draft!.announce.message;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    patch({ announce: { ...draft!.announce, message: value.slice(0, start) + `{${variable}}` + value.slice(end) } });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + variable.length + 2, start + variable.length + 2);
    });
  }

  async function onSave() {
    if (!draft || !data?.autoRoles) return;
    setIssues({});
    const local = validateAutoRoleConfig(
      draft,
      new Set(data.autoRoles.roles.assignable.map((role) => role.id)),
      channels ? new Set(channels.map((channel) => channel.id)) : undefined,
    );
    if (Object.keys(local).length) {
      setIssues(local);
      toast.error('Fix the highlighted fields and try again.');
      focusFirst(local);
      return;
    }
    try {
      const response = await save({ guildId, config: draft }).unwrap();
      setDraft(response.config);
      setSaved(response.config);
      toast.success('Auto Roles saved');
    } catch (error) {
      if (isRateLimited(error)) return;
      const byPath = issuesByPath(errorBody(error));
      if (Object.keys(byPath).length) {
        setIssues(byPath);
        focusFirst(byPath);
        toast.error('Fix the highlighted fields and try again.');
      } else {
        toast.error(errorMessage(error, 'Could not save Auto Roles.'));
      }
    }
  }

  async function onTest() {
    try {
      const response = await test(guildId).unwrap();
      const name = channels?.find((item) => item.id === response.channelId)?.name;
      toast.success(name ? `Test announcement sent to #${name}` : 'Test announcement sent');
    } catch (error) {
      if (isRateLimited(error)) return;
      toast.error(errorMessage(error, 'Could not send the test announcement.'));
    }
  }

  const channel = channels?.find((item) => item.id === draft.announce.channelId);
  const savedChannelMissing = !!channels && !!draft.announce.channelId && !channel;

  return (
    <div>
      <PageHeader
        title="Auto Roles"
        description="Give new members a role automatically with adaptive timing."
        right={
          <>
            <StatusPill on={draft.enabled} />
            <Switch aria-label="Enable Auto Roles" checked={draft.enabled} onCheckedChange={(enabled) => patch({ enabled })} />
          </>
        }
      />
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_440px]">
        <div className="space-y-4 pb-24">
          <Section title="Status" description="Required server permissions and channel access.">
            <div className="space-y-3">
              {[
                { ok: data.autoRoles.checks.hasManageRoles, label: 'Bot has Manage Roles', fix: 'Give the DexBotX bot role the Manage Roles permission in Server Settings, Roles.' },
                { ok: data.autoRoles.checks.roleBelowBot, label: 'Chosen role is below the bot', fix: 'Move the DexBotX role above the chosen role in Server Settings, Roles.' },
                { ok: data.autoRoles.checks.canSendInChannel, label: 'Bot can send in the chosen channel', fix: 'Allow View Channel and Send Messages for DexBotX in this channel.' },
              ].map((item) => (
                <div key={item.label} className="flex items-start gap-2 text-sm">
                  <ShieldCheck aria-hidden="true" className={cn('mt-0.5 size-4 shrink-0', item.ok ? 'text-success' : 'text-warning')} />
                  <div>
                    <p>{item.label}</p>
                    {!item.ok && <p className="text-xs text-muted-foreground">{item.fix}</p>}
                  </div>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Role" description="Choose one role for new members.">
            <div className="space-y-3">
              {data.autoRoles.roles.assignable.length ? (
                <>
                  <div className="w-full space-y-3">
                    <Field label="Role to assign" htmlFor="auto-role" error={fieldError('roleIds')}>
                      <Select
                        id="auto-role"
                        name="autoRoleId"
                        value={draft.roleIds[0] ?? ''}
                        aria-invalid={!!fieldError('roleIds')}
                        aria-describedby={fieldError('roleIds') ? 'auto-role-error' : undefined}
                        onChange={(event) => patch({ roleIds: event.target.value ? [event.target.value] : [] })}
                      >
                        <option value="">Select a role…</option>
                        <optgroup label="Assignable roles">
                          {data.autoRoles.roles.assignable.map((role) => (
                            <option key={role.id} value={role.id}>
                              @ {role.name}
                            </option>
                          ))}
                        </optgroup>
                      </Select>
                    </Field>
                  </div>
                </>
              ) : (
                <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                  No assignable roles found. Move the DexBotX role above safe roles and remove Administrator or moderation permissions from the role.
                </p>
              )}
              {!!draft.roleIds[0] && !data.autoRoles.roles.assignable.some((role) => role.id === draft.roleIds[0]) && (
                <Badge tone="warning" className="gap-1.5"><AlertTriangle className="size-3" />Saved role became unsafe</Badge>
              )}
            </div>
          </Section>

          <Section title="Member filters" description="Choose which members can receive the role.">
            <div className="mt-4 space-y-3">
              <ToggleRow id="skip-bots" label="Skip bots" hint="Do not assign the role to bot accounts." checked={draft.skipBots} onChange={(skipBots) => patch({ skipBots })} />
              <ToggleRow id="wait-screening" label="Wait for membership screening" hint="Assign after screening is complete." checked={draft.waitForScreening} onChange={(waitForScreening) => patch({ waitForScreening })} />
            </div>
          </Section>

          <Section title="Announcement" description="Send text and an optional embed after roles are assigned." action={<Switch aria-label="Enable announcement" checked={draft.announce.enabled} onCheckedChange={(enabled) => patch({ announce: { ...draft.announce, enabled } })} />}>
            <fieldset disabled={!draft.announce.enabled} className={cn('min-w-0 space-y-4 border-0 p-0', !draft.announce.enabled && 'opacity-45')}>
              <legend className="sr-only">Announcement settings</legend>
              <Field label="Channel" htmlFor="announcement-channel" error={fieldError('announce.channelId')} hint={draft.announce.channelId ? (data.autoRoles.checks.canSendInChannel ? 'DexBotX can send in this channel.' : 'DexBotX needs View Channel and Send Messages.') : 'Choose a text or announcement channel.'}>
                <Select
                  id="announcement-channel"
                  name="announcementChannelId"
                  value={draft.announce.channelId ?? ''}
                  aria-invalid={!!fieldError('announce.channelId')}
                  aria-describedby={fieldError('announce.channelId') ? 'announcement-channel-error' : undefined}
                  onChange={(event) => patch({ announce: { ...draft.announce, channelId: event.target.value || null } })}
                >
                  <option value="">{channels ? 'Select a channel…' : channelsError ? 'Channels unavailable' : 'Loading channels…'}</option>
                  {groupedChannels.map(([category, items]) => (
                    <optgroup key={category} label={category}>
                      {items.map((item) => <option key={item.id} value={item.id}># {item.name}</option>)}
                    </optgroup>
                  ))}
                </Select>
              </Field>
              {channelsError && (
                <p role="alert" className="text-sm text-destructive">
                  {errorMessage(channelsError, 'Could not load channels.')}
                </p>
              )}
              {savedChannelMissing && (
                <p className="flex items-start gap-1.5 text-xs text-warning">
                  <TriangleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                  The channel saved before no longer exists. Pick another one.
                </p>
              )}
              <Field label="Template" htmlFor="announcement-template" counter={`${draft.announce.message.length}/300`} error={fieldError('announce.message')}>
                <Textarea
                  ref={templateRef}
                  id="announcement-template"
                  name="announcementMessage"
                  maxLength={300}
                  value={draft.announce.message}
                  aria-invalid={!!fieldError('announce.message')}
                  aria-describedby={fieldError('announce.message') ? 'announcement-template-error' : undefined}
                  onChange={(event) => patch({ announce: { ...draft.announce, message: event.target.value } })}
                />
              </Field>
              <div className="flex flex-wrap gap-2" aria-label="Template variables">
                {['user', 'username', 'role', 'server', 'memberCount'].map((variable) => (
                  <Button key={variable} type="button" variant="outline" size="sm" onClick={() => insertVariable(variable)}>{`{${variable}}`}</Button>
                ))}
              </div>
            </fieldset>
          </Section>

          <Section
            title="Embed"
            description="A styled box. When on, the message appears inside it."
            action={
              <Switch
                aria-label="Enable embed"
                checked={draft.announce.embed.enabled}
                onCheckedChange={(enabled) => patch({ announce: { ...draft.announce, embed: { ...draft.announce.embed, enabled } } })}
              />
            }
          >
            <div className={cn('space-y-4', !draft.announce.embed.enabled && 'pointer-events-none opacity-45')} aria-disabled={!draft.announce.embed.enabled}>
              <Field label="Title" htmlFor="announcement-embed-title" counter={`${draft.announce.embed.title.length}/256`} error={fieldError('announce.embed.title')}>
                <Input
                  id="announcement-embed-title"
                  value={draft.announce.embed.title}
                  maxLength={256}
                  aria-invalid={!!fieldError('announce.embed.title')}
                  aria-describedby={fieldError('announce.embed.title') ? 'announcement-embed-title-error' : undefined}
                  onChange={(event) => patch({ announce: { ...draft.announce, embed: { ...draft.announce.embed, title: event.target.value } } })}
                />
              </Field>
              <Field
                label="Description"
                htmlFor="announcement-embed-description"
                counter={`${draft.announce.embed.description.length}/2000`}
                error={fieldError('announce.embed.description')}
                hint="Variables like {user}, {role}, and {memberCount} work here too."
              >
                <Textarea
                  id="announcement-embed-description"
                  value={draft.announce.embed.description}
                  maxLength={2000}
                  aria-invalid={!!fieldError('announce.embed.description')}
                  aria-describedby={fieldError('announce.embed.description') ? 'announcement-embed-description-error' : undefined}
                  onChange={(event) => patch({ announce: { ...draft.announce, embed: { ...draft.announce.embed, description: event.target.value } } })}
                />
              </Field>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Colour" htmlFor="announcement-embed-color">
                  <ColorField
                    id="announcement-embed-color"
                    value={draft.announce.embed.color}
                    onChange={(color) => patch({ announce: { ...draft.announce, embed: { ...draft.announce.embed, color } } })}
                  />
                </Field>
                <Field label="Footer" htmlFor="announcement-embed-footer" counter={`${draft.announce.embed.footer.length}/200`} error={fieldError('announce.embed.footer')}>
                  <Input
                    id="announcement-embed-footer"
                    value={draft.announce.embed.footer}
                    maxLength={200}
                    aria-invalid={!!fieldError('announce.embed.footer')}
                    aria-describedby={fieldError('announce.embed.footer') ? 'announcement-embed-footer-error' : undefined}
                    onChange={(event) => patch({ announce: { ...draft.announce, embed: { ...draft.announce.embed, footer: event.target.value } } })}
                  />
                </Field>
              </div>
            </div>
          </Section>

        </div>

        <aside className="space-y-6 lg:sticky lg:top-24">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-muted-foreground">Announcement preview</h2>
              {!draft.enabled && <Badge tone="warning">Not sending yet</Badge>}
            </div>
            <div className="overflow-hidden rounded-xl border border-border bg-[#313338] text-[#dbdee1] shadow-xl">
              <div className="flex items-center gap-1.5 border-b border-black/30 px-4 py-2.5 text-sm font-semibold text-white">
                <Hash aria-hidden="true" className="size-4 text-[#80848e]" /> {channel?.name ?? 'choose-a-channel'}
              </div>
              <div className="flex gap-3.5 px-4 py-4">
                <LogoMark className="size-10 shrink-0" />
                <div className="min-w-0 flex-1 text-[15px] leading-[1.4]">
                  <DiscordMessageAuthor />
                  <div className="mt-0.5 whitespace-pre-wrap break-words">
                    {renderPreview(draft.announce.message, roleName, data.guild.name, data.guild.memberCount)}
                  </div>
                  {draft.announce.embed.enabled && (
                    <div className="mt-2 max-w-[432px] rounded border-l-4 bg-[#2b2d31] p-3" style={{ borderLeftColor: draft.announce.embed.color }}>
                      {draft.announce.embed.title && (
                        <div className="font-semibold text-white">
                          {renderPreview(draft.announce.embed.title, roleName, data.guild.name, data.guild.memberCount)}
                        </div>
                      )}
                      {draft.announce.embed.description && (
                        <div className="mt-1 whitespace-pre-wrap break-words text-sm">
                          {renderPreview(draft.announce.embed.description, roleName, data.guild.name, data.guild.memberCount)}
                        </div>
                      )}
                      {draft.announce.embed.footer && (
                        <div className="mt-2 text-xs text-[#949ba4]">
                          {renderPreview(draft.announce.embed.footer, roleName, data.guild.name, data.guild.memberCount)}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <Button variant="secondary" className="w-full" onClick={onTest} disabled={testing || dirty || !data.autoRoles.canTest}>
              <Send aria-hidden="true" /> {testing ? 'Sending…' : 'Send test to channel'}
            </Button>
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <Hash aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
              {dirty ? 'Save your changes first. The test sends the saved version.' : channel ? `Sends the saved template to #${channel.name}.` : 'Choose a channel and save to enable test messages.'}
            </p>
          </div>

          <Section title="Recent activity" description="The latest 20 automatic role outcomes.">
            {activityLoading && !activityData ? (
              <div aria-busy="true" aria-label="Loading activity" className="space-y-2"><Skeleton className="h-10" /><Skeleton className="h-10" /><Skeleton className="h-10" /></div>
            ) : (
              <>
                {activityError && (
                  <p role="alert" className="mb-3 text-sm text-destructive">
                    {errorMessage(activityError, 'Could not load recent Auto Roles activity.')}
                  </p>
                )}
                {!activityData ? (
                  activityError ? null : <p role="status" className="text-sm text-muted-foreground">Activity is not available yet.</p>
                ) : activityData.activity.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No auto-role activity yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead><tr className="border-b border-border text-xs text-muted-foreground"><th className="py-2">User</th><th>Status</th><th className="text-right">Time</th></tr></thead>
                      <tbody>
                        {activityData.activity.map((item) => (
                          <tr key={item.id} className="border-b border-border last:border-0">
                            <td className="py-2 font-mono text-xs">{item.userId}</td>
                            <td className="py-2"><Badge tone={item.outcome === 'assigned' ? 'success' : item.outcome === 'failed' ? 'warning' : 'neutral'}>{item.outcome.replaceAll('_', ' ')}</Badge></td>
                            <td className="py-2 text-right text-xs text-muted-foreground">{relativeTime(item.createdAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </Section>
        </aside>

        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-20 flex justify-center px-4" aria-live="polite">
          <div className={cn('pointer-events-auto flex items-center gap-3 rounded-2xl border border-border bg-card/95 px-4 py-2.5 shadow-2xl backdrop-blur transition-all', dirty ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-4 opacity-0')}>
            <span className="text-sm">Unsaved changes</span>
            <Button type="button" variant="ghost" size="sm" onClick={() => { setIssues({}); setDraft(saved); }} disabled={saving}>
              <RotateCcw aria-hidden="true" /> Discard
            </Button>
            <Button type="button" size="sm" onClick={onSave} disabled={saving || hasProblems}>
              <Save aria-hidden="true" /> {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
