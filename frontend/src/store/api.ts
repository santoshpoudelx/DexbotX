import {
  createApi,
  fetchBaseQuery,
  type BaseQueryFn,
  type FetchArgs,
  type FetchBaseQueryError,
} from '@reduxjs/toolkit/query/react';
import type { TypedUseQuerySubscriptionOptions } from '@reduxjs/toolkit/query/react';
import { toast } from 'sonner';
import { parseRetryAfter, rateLimitMessage } from '@/lib/rate-limit';
import { setLoggedOutHintCookie } from '@/lib/utils';
import type {
  Channel,
  GuildDetail,
  GuildRefreshResult,
  GuildRole,
  GuildSettings,
  GuildSummary,
  Me,
  MessageConfig,
  MessageKind,
  Preset,
  SavedMessage,
  AutoRoleConfig,
  AutoRoleResponse,
  AutoRoleActivity,
  EconomyItem,
  EconomySafeRole,
  EconomySettings,
  EconomyState,
} from '@/lib/types';

const rawBaseQuery = fetchBaseQuery({
  // Same-origin: Next.js proxies /api/* to the backend, so the httpOnly session cookie rides along automatically.
  baseUrl: '/api',
  credentials: 'same-origin',
});

const baseQuery: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (args, baseQueryApi, extra) => {
  const result = await rawBaseQuery(args, baseQueryApi, extra);
  const requestUrl = typeof args === 'string' ? args : args.url;
  if (
    result.error?.status === 401 &&
    !requestUrl.startsWith('/auth/') &&
    typeof window !== 'undefined'
  ) {
    setLoggedOutHintCookie();
    baseQueryApi.dispatch(api.util.invalidateTags(['Auth']));
  }
  // Rate limited: tell the user how long to wait. A fixed toast id collapses repeats into one message. No auto-retry.
  if (result.error?.status === 429 && typeof window !== 'undefined') {
    toast.error(rateLimitMessage(parseRetryAfter(result.meta?.response?.headers.get('retry-after'))), { id: 'rate-limit' });
  }
  return result;
};

export const api = createApi({
  reducerPath: 'api',
  baseQuery,
  tagTypes: ['Auth', 'Guilds', 'Guild', 'Channels', 'Roles', 'Economy'],
  refetchOnFocus: false,
  refetchOnReconnect: false,
  refetchOnMountOrArgChange: false,
  keepUnusedDataFor: 3600,
  endpoints: (b) => ({
    getMe: b.query<Me, void>({
      query: () => '/auth/me',
      providesTags: ['Auth'],
    }),
    logout: b.mutation<void, void>({
      query: () => ({ url: '/auth/logout', method: 'POST', credentials: 'include' }),
    }),

    getGuilds: b.query<GuildSummary[], void>({
      query: () => '/guilds',
      transformResponse: (r: { guilds: GuildSummary[] }) => r.guilds,
      providesTags: ['Guilds'],
    }),
    getGuild: b.query<{
      guild: GuildDetail;
      settings: GuildSettings;
      autoRoles: AutoRoleResponse;
      imageKeys: Record<MessageKind, string | null>;
      assetHashes: { avatar: string | null; banner: string | null };
    }, string>({
      query: (guildId) => `/guilds/${guildId}`,
      keepUnusedDataFor: 600,
      providesTags: (_r, _e, guildId) => [{ type: 'Guild', id: guildId }],
    }),
    getChannels: b.query<Channel[], string>({
      query: (guildId) => `/guilds/${guildId}/channels`,
      transformResponse: (r: { channels: Channel[] }) => r.channels,
      providesTags: (_r, _e, guildId) => [{ type: 'Channels', id: guildId }],
    }),
    getRoles: b.query<GuildRole[], string>({
      query: (guildId) => `/guilds/${guildId}/roles`,
      transformResponse: (r: { roles: GuildRole[] }) => r.roles,
      keepUnusedDataFor: 600,
      providesTags: (_r, _e, guildId) => [{ type: 'Roles', id: guildId }],
    }),
    refreshGuild: b.mutation<GuildRefreshResult, string>({
      query: (guildId) => ({ url: `/guilds/${guildId}/refresh`, method: 'POST' }),
      invalidatesTags: (_r, _e, guildId) => [
        { type: 'Guild', id: guildId },
        { type: 'Channels', id: guildId },
        { type: 'Roles', id: guildId },
      ],
    }),
    getPresets: b.query<Preset[], void>({
      query: () => '/presets',
      transformResponse: (r: { presets: Preset[] }) => r.presets,
    }),

    saveMessage: b.mutation<SavedMessage, { guildId: string; kind: MessageKind; config: MessageConfig }>({
      query: ({ guildId, kind, config }) => ({ url: `/guilds/${guildId}/messages/${kind}`, method: 'PUT', body: config }),
      async onQueryStarted({ guildId, kind }, { dispatch, queryFulfilled }) {
        try {
          const { data: saved } = await queryFulfilled;
          dispatch(api.util.updateQueryData('getGuild', guildId, (current) => {
            current.settings[kind] = saved.config;
            current.imageKeys[kind] = saved.imageKey;
          }));
        } catch {
          // The mutation result reports save failures to its caller.
        }
      },
    }),
    resetMessage: b.mutation<SavedMessage, { guildId: string; kind: MessageKind }>({
      query: ({ guildId, kind }) => ({ url: `/guilds/${guildId}/messages/${kind}`, method: 'DELETE' }),
      async onQueryStarted({ guildId, kind }, { dispatch, queryFulfilled }) {
        try {
          const { data: saved } = await queryFulfilled;
          dispatch(api.util.updateQueryData('getGuild', guildId, (current) => {
            current.settings[kind] = saved.config;
            current.imageKeys[kind] = saved.imageKey;
          }));
        } catch {
          // The mutation result reports reset failures to its caller.
        }
      },
    }),
    /** multipart/form-data; fetchBaseQuery leaves the Content-Type to the browser so the boundary is set correctly. */
    uploadBackground: b.mutation<{ path: string }, { guildId: string; file: File }>({
      query: ({ guildId, file }) => {
        const body = new FormData();
        body.append('file', file);
        return { url: `/guilds/${guildId}/assets/background`, method: 'POST', body };
      },
    }),
    sendTest: b.mutation<{ channelId: string }, { guildId: string; kind: MessageKind }>({
      query: ({ guildId, kind }) => ({ url: `/guilds/${guildId}/messages/${kind}/test`, method: 'POST' }),
    }),
    saveAutoRoles: b.mutation<AutoRoleResponse, { guildId: string; config: AutoRoleConfig }>({
      query: ({ guildId, config }) => ({ url: `/guilds/${guildId}/auto-roles`, method: 'PUT', body: config }),
      async onQueryStarted({ guildId }, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(api.util.updateQueryData('getGuild', guildId, (current) => {
            current.autoRoles = data;
          }));
        } catch {
          // The mutation result reports save failures to its caller.
        }
      },
    }),
    testAutoRoles: b.mutation<{ channelId: string }, string>({
      query: (guildId) => ({ url: `/guilds/${guildId}/auto-roles/test`, method: 'POST' }),
    }),
    getAutoRoleActivity: b.query<{ activity: AutoRoleActivity[] }, string>({
      query: (guildId) => `/guilds/${guildId}/auto-roles/activity`,
      keepUnusedDataFor: 30,
    }),
    getEconomy: b.query<{ settings: EconomySettings; state: EconomyState }, string>({
      query: (guildId) => `/guilds/${guildId}/economy`,
      providesTags: (_r, _e, guildId) => [{ type: 'Economy', id: guildId }],
    }),
    enableEconomy: b.mutation<{ ok: boolean; message: string; channels?: Record<string, string> }, string>({
      query: (guildId) => ({ url: `/guilds/${guildId}/economy/enable`, method: 'POST' }),
      invalidatesTags: (_r, _e, guildId) => [{ type: 'Economy', id: guildId }],
    }),
    disableEconomy: b.mutation<{ ok: true }, string>({
      query: (guildId) => ({ url: `/guilds/${guildId}/economy/disable`, method: 'POST' }),
      async onQueryStarted(guildId, { dispatch, queryFulfilled }) {
        const patch = dispatch(api.util.updateQueryData('getEconomy', guildId, (draft) => {
          draft.state.enabled = false;
        }));
        try { await queryFulfilled; } catch { patch.undo(); }
      },
      invalidatesTags: (_r, _e, guildId) => [{ type: 'Economy', id: guildId }],
    }),
    pauseEconomy: b.mutation<{ ok: true }, string>({
      query: (guildId) => ({ url: `/guilds/${guildId}/economy/pause`, method: 'POST' }),
      async onQueryStarted(guildId, { dispatch, queryFulfilled }) {
        const patch = dispatch(api.util.updateQueryData('getEconomy', guildId, (draft) => {
          draft.state.paused = true;
        }));
        try { await queryFulfilled; } catch { patch.undo(); }
      },
      invalidatesTags: (_r, _e, guildId) => [{ type: 'Economy', id: guildId }],
    }),
    resumeEconomy: b.mutation<{ ok: true }, string>({
      query: (guildId) => ({ url: `/guilds/${guildId}/economy/resume`, method: 'POST' }),
      async onQueryStarted(guildId, { dispatch, queryFulfilled }) {
        const patch = dispatch(api.util.updateQueryData('getEconomy', guildId, (draft) => {
          draft.state.paused = false;
        }));
        try { await queryFulfilled; } catch { patch.undo(); }
      },
      invalidatesTags: (_r, _e, guildId) => [{ type: 'Economy', id: guildId }],
    }),
    updateEconomySettings: b.mutation<{ settings: EconomySettings }, { guildId: string; settings: EconomySettings }>({
      query: ({ guildId, settings }) => ({ url: `/guilds/${guildId}/economy/settings`, method: 'PUT', body: settings }),
      invalidatesTags: (_r, _e, { guildId }) => [{ type: 'Economy', id: guildId }],
    }),
    getEconomyItems: b.query<{ items: EconomyItem[] }, string>({
      query: (guildId) => `/guilds/${guildId}/economy/items`,
      providesTags: (_r, _e, guildId) => [{ type: 'Economy', id: `${guildId}:items` }],
    }),
    updateEconomyItem: b.mutation<{ ok: true }, { guildId: string; itemId: string; item: Partial<EconomyItem> }>({
      query: ({ guildId, itemId, item }) => ({ url: `/guilds/${guildId}/economy/items/${itemId}`, method: 'PUT', body: item }),
      async onQueryStarted({ guildId, itemId, item }, { dispatch, queryFulfilled }) {
        const patch = dispatch(api.util.updateQueryData('getEconomyItems', guildId, (draft) => {
          const target = draft.items.find((entry) => entry.itemId === itemId);
          if (target) Object.assign(target, item);
        }));
        try { await queryFulfilled; } catch { patch.undo(); }
      },
      invalidatesTags: (_r, _e, { guildId }) => [{ type: 'Economy', id: `${guildId}:items` }],
    }),
    deleteEconomyItem: b.mutation<{ ok: true }, { guildId: string; itemId: string }>({
      query: ({ guildId, itemId }) => ({ url: `/guilds/${guildId}/economy/items/${itemId}`, method: 'DELETE' }),
      async onQueryStarted({ guildId, itemId }, { dispatch, queryFulfilled }) {
        const patch = dispatch(api.util.updateQueryData('getEconomyItems', guildId, (draft) => {
          draft.items = draft.items.filter((entry) => entry.itemId !== itemId);
        }));
        try { await queryFulfilled; } catch { patch.undo(); }
      },
      invalidatesTags: (_r, _e, { guildId }) => [{ type: 'Economy', id: `${guildId}:items` }],
    }),
    createEconomyItem: b.mutation<{ ok: true; item?: EconomyItem }, { guildId: string; item: Partial<EconomyItem> }>({
      query: ({ guildId, item }) => ({ url: `/guilds/${guildId}/economy/items`, method: 'POST', body: item }),
      async onQueryStarted({ guildId }, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          if (data?.item) {
            dispatch(api.util.updateQueryData('getEconomyItems', guildId, (draft) => {
              if (!draft.items.some((entry) => entry.itemId === data.item!.itemId)) {
                draft.items.push(data.item!);
              }
            }));
          }
        } catch {
          // Handled by caller
        }
      },
      invalidatesTags: (_r, _e, { guildId }) => [{ type: 'Economy', id: `${guildId}:items` }],
    }),
    reorderEconomyItems: b.mutation<{ ok: true }, { guildId: string; itemIds: string[] }>({
      query: ({ guildId, itemIds }) => ({ url: `/guilds/${guildId}/economy/items-reorder`, method: 'PUT', body: { itemIds } }),
      invalidatesTags: (_r, _e, { guildId }) => [{ type: 'Economy', id: `${guildId}:items` }],
    }),
    getEconomyRoles: b.query<{ roles: EconomySafeRole[] }, string>({
      query: (guildId) => `/guilds/${guildId}/economy/roles`,
      providesTags: (_r, _e, guildId) => [{ type: 'Roles', id: guildId }],
    }),
    deleteEconomyChannels: b.mutation<{ ok: true }, string>({
      query: (guildId) => ({ url: `/guilds/${guildId}/economy/delete-channels`, method: 'POST', body: { confirm: true } }),
      invalidatesTags: (_r, _e, guildId) => [{ type: 'Economy', id: guildId }],
    }),
  }),
});

const getMeQuery = api.endpoints.getMe.useQuery;
const getGuildsQuery = api.endpoints.getGuilds.useQuery;
const getGuildQuery = api.endpoints.getGuild.useQuery;
const getChannelsQuery = api.endpoints.getChannels.useQuery;
const getPresetsQuery = api.endpoints.getPresets.useQuery;

type QueryOptions = Omit<TypedUseQuerySubscriptionOptions, 'refetchOnMountOrArgChange'>;

// RTK Query applies mount freshness at the hook level, so keep endpoint policies centralized here.
export function useGetMeQuery(arg?: void, options?: QueryOptions) {
  return getMeQuery(arg, { ...options, refetchOnMountOrArgChange: 300 });
}

export function useGetGuildsQuery(arg?: void, options?: QueryOptions) {
  return getGuildsQuery(arg, { ...options, refetchOnMountOrArgChange: false });
}

export function useGetGuildQuery(guildId: string, options?: QueryOptions) {
  return getGuildQuery(guildId, { ...options, refetchOnMountOrArgChange: 300 });
}

export function useGetChannelsQuery(guildId: string, options?: QueryOptions) {
  return getChannelsQuery(guildId, { ...options, refetchOnMountOrArgChange: false });
}

export function useGetPresetsQuery(arg?: void, options?: QueryOptions) {
  return getPresetsQuery(arg, { ...options, refetchOnMountOrArgChange: 86400 });
}

export const {
  useLogoutMutation,
  useGetRolesQuery,
  useRefreshGuildMutation,
  useSaveMessageMutation,
  useResetMessageMutation,
  useSendTestMutation,
  useSaveAutoRolesMutation,
  useTestAutoRolesMutation,
  useGetAutoRoleActivityQuery,
  useGetEconomyQuery,
  useEnableEconomyMutation,
  useDisableEconomyMutation,
  usePauseEconomyMutation,
  useResumeEconomyMutation,
  useUpdateEconomySettingsMutation,
  useGetEconomyItemsQuery,
  useUpdateEconomyItemMutation,
  useDeleteEconomyItemMutation,
  useCreateEconomyItemMutation,
  useReorderEconomyItemsMutation,
  useGetEconomyRolesQuery,
  useDeleteEconomyChannelsMutation,
  useUploadBackgroundMutation,
} = api;
