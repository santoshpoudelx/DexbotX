# DexBotX Full-Stack Production & Security Audit Report

## Reviewed Repository Inventory

Every directory and source file in the attached `DexbotX-main.zip` archive was inspected in full before producing this audit. No source files were truncated.

* **Root Configuration, Security & CI/CD (9 files):** `.gitattributes`, `.gitignore`, `.github/workflows/backend-ci.yml`, `.github/workflows/frontend-ci.yml`, `.github/workflows/security.yml`, `.semgrep.yml`, `gitleaks.toml`, `Readme.md`, `DexbotxArch.jpg`, `Coding.gif`, `loading.svg`.

* **Backend Root, Build, Deployment & Migrations (`backend/`, 19 files):** `.dockerignore`, `.env.example`, `.gitignore`, `Dockerfile`, `README.md`, `drizzle.config.ts`, `eslint.config.mjs`, `jest.config.js`, `jest.e2e.config.js`, `nest-cli.json`, `package.json`, `package-lock.json`, `render.yaml`, `tsconfig.build.json`, `tsconfig.json`, `tsconfig.spec.json`, `scripts/register-commands.ts`, `drizzle/0000_swift_white_tiger.sql`, `drizzle/0001_guild_data.sql`, `drizzle/0002_admin_operations.sql`, `drizzle/0003_mod_actions.sql`, `drizzle/meta/0000_snapshot.json`, `drizzle/meta/_journal.json`.

* **Backend Source & Tests (`backend/src/` and `backend/test/`, 83 files):**

  * **Entrypoints & App Setup:** `src/main.ts`, `src/app.module.ts`, `src/app.setup.ts`, `src/app.setup.spec.ts`, `src/types/on-headers.d.ts`.

  * **Core & Common:** `src/core/config.ts`, `src/core/config.spec.ts`, `src/core/core.module.ts`, `src/core/feature-flags.service.ts`, `src/common/all-exceptions.filter.ts`, `src/common/decorators.ts`, `src/common/performance-headers.interceptor.ts`, `src/common/performance-headers.interceptor.spec.ts`, `src/common/request.guard.ts`, `src/common/types.ts`, `src/common/zod-validation.pipe.ts`.

  * **Auth & Sessions:** `src/auth/auth.controller.ts`, `src/auth/auth.module.ts`, `src/auth/auth.service.ts`, `src/auth/cookies.ts`, `src/auth/session.service.ts`.

  * **Admin Console API:** `src/admin/admin.controller.ts`, `src/admin/admin.guard.ts`, `src/admin/admin.module.ts`, `src/admin/admin-audit.service.ts`, `src/admin/admin-messages.service.ts`, `src/admin/admin-operations.service.ts`, `src/admin/admin-overview.service.ts`, `src/admin/admin-users-content.service.ts`, `src/admin/stats.service.ts`.

  * **Database & Redis:** `src/db/database.service.ts`, `src/db/schema.ts`, `src/db/migrate.ts`, `src/db/backfill-guild-data.ts`, `src/redis/redis.module.ts`, `src/redis/redis.service.ts`, `src/redis/rate-limiter.service.ts`, `src/redis/settings-cache.service.ts`.

  * **Discord Gateway Bot & Slash Commands:** `src/bot/manager.ts`, `src/bot/shard.ts`, `src/bot/bot.module.ts`, `src/bot/bot.service.ts`, `src/bot/guild-sync.service.ts`, `src/bot/guild-sync.service.spec.ts`, `src/bot/moderation.service.ts`, `src/bot/commands/index.ts`, `src/bot/commands/moderation.guard.ts`, `src/bot/commands/moderation.guard.spec.ts`, `src/bot/commands/ban.ts`, `src/bot/commands/kick.ts`, `src/bot/commands/timeout.ts`, `src/bot/commands/unban.ts`, `src/bot/commands/untimeout.ts`.

  * **Discord REST, Onboarding & Guilds:** `src/discord/discord.module.ts`, `src/discord/discord-rest.service.ts`, `src/discord/channel-access.service.ts`, `src/discord/onboarding.constants.ts`, `src/discord/onboarding.service.ts`, `src/guilds/guilds.module.ts`, `src/guilds/guilds.controller.ts`, `src/guilds/guilds.service.ts`, `src/guilds/guild-access.guard.ts`, `src/guilds/guild-events.ts`, `src/guilds/guild-events.controller.ts`, `src/guilds/guild-events.service.ts`, `src/guilds/guild-events.service.spec.ts`, `src/guilds/bot-added.controller.ts`, `src/guilds/bot-added.controller.spec.ts`, `src/guilds/invite.controller.ts`, `src/guilds/invite.controller.spec.ts`.

  * **Welcome, Rendering, Storage, Templates, Queue, Worker, Realtime, Health & Metrics:** `src/welcome/welcome.module.ts`, `src/welcome/welcome.controller.ts`, `src/welcome/welcome.service.ts`, `src/welcome/welcome.service.spec.ts`, `src/render/render.module.ts`, `src/render/render.service.ts`, `src/render/render.spec.ts`, `src/render/message-builder.service.ts`, `src/render/asset-fetcher.service.ts`, `src/assets/assets.module.ts`, `src/assets/assets.controller.ts`, `src/assets/background-image.ts`, `src/storage/storage.module.ts`, `src/storage/asset-storage.service.ts`, `src/templates/templates.module.ts`, `src/templates/templates.controller.ts`, `src/queue/queue.module.ts`, `src/queue/member-events.queue.ts`, `src/worker/worker.ts`, `src/worker/worker.module.ts`, `src/worker/member-events.processor.ts`, `src/realtime/realtime.module.ts`, `src/realtime/realtime.controller.ts`, `src/realtime/realtime.gateway.ts`, `src/realtime/realtime.gateway.spec.ts`, `src/health/health.module.ts`, `src/health/health.controller.ts`, `src/metrics/metrics.module.ts`, `src/metrics/metrics.controller.ts`, `src/metrics/metrics.service.ts`, `src/metrics/http-metrics.interceptor.ts`, `src/shared/card-key.ts`, `src/shared/crypto.ts`, `src/shared/discord-cdn.ts`, `src/shared/message-config.ts`, `src/shared/permissions.ts`, `src/shared/placeholders.ts`, `src/shared/presets.ts`, `src/shared/semaphore.ts`, `src/shared/shared.spec.ts`, `test/api.e2e-spec.ts`, `test/helpers/embedded-pg.mjs`.

* **Frontend Root, App Router, Components, Store & Lib (`frontend/`, 102 files):**

  * **Config & Public Assets:** `.dockerignore`, `.env.example`, `.gitignore`, `Dockerfile`, `README.md`, `eslint.config.mjs`, `next-env.d.ts`, `next.config.mjs`, `package.json`, `package-lock.json`, `postcss.config.mjs`, `tsconfig.json`, `vitest.config.mts`, `scripts/analyze.mjs`, `public/*` (11 files), `src/assets/*` (13 files).

  * **App Router Pages & Routes (`src/app/`):** `globals.css`, `layout.tsx`, `page.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx`, `manifest.ts`, `robots.ts`, `sitemap.ts`, `opengraph-image.tsx`, `maskable-icon/route.tsx`, `api/[[...path]]/route.ts`, `api/[[...path]]/route.spec.ts`, `about/page.tsx`, `commands/page.tsx`, `faq/page.tsx`, `features/page.tsx`, `features/[slug]/page.tsx`, `privacy/page.tsx`, `terms/page.tsx`, `dashboard/layout.tsx`, `dashboard/page.tsx`, `dashboard/[guildId]/layout.tsx`, `dashboard/[guildId]/loading.tsx`, `dashboard/[guildId]/page.tsx`, `dashboard/[guildId]/overview/page.tsx`, `dashboard/[guildId]/overview/loading.tsx`, `dashboard/[guildId]/[kind]/page.tsx`, `dashboard/[guildId]/[kind]/loading.tsx`, `dashboard/[guildId]/music/page.tsx`, `dashboard/[guildId]/social/page.tsx`, `admin/layout.tsx`, `admin/loading.tsx`, `admin/page.tsx`, `admin/audit/page.tsx`, `admin/content/page.tsx`, `admin/failures/page.tsx`, `admin/rate-limits/page.tsx`, `admin/servers/page.tsx`, `admin/servers/[guildId]/page.tsx`, `admin/settings/page.tsx`, `admin/users/page.tsx`.

  * **Components, Store & Utilities (`src/components/`, `src/store/`, `src/lib/`):** All 28 component files under `src/components/`, all 6 Redux store files under `src/store/`, and all 22 utility and unit test files under `src/lib/`.

* **Missing / Non-Verifiable Items Flagged:**

  * Git commit history (`.git/` directory) is not included in the `.zip` export; secret history in past commits is **Not verifiable** from the archive (though `.github/workflows/security.yml` runs Gitleaks across full git history in CI).

  * Cloud hosting provider settings (Vercel environment variables, Render dashboard secrets, Supabase bucket policies, and VPC/firewall rules) are **Not verifiable** from source files alone.

## Part 1: Audit Report

### 1. Executive Summary

* **Overall Production-Readiness Score:** **6.8 / 10**

* **Launch Verdict:** **No (Yes with conditions — fix the 4 Critical and 6 High findings before public launch).**
  The codebase has an unusually strong architectural foundation—encrypted server-side sessions (`AES-256-GCM`), `__Host-` cookies, strict Zod validation, decompression-bomb image header probing, a separated API / Gateway Shard / BullMQ Worker process model, and an impressive 1,956-line real Postgres + Redis e2e test suite. However, four critical production blockers will cause immediate outages, broken rendering, or severe scalability collapse under real user traffic.

* **Top 5 Risks:**

  1. **\[Critical | UX-01\] Entire Landing Page (`/`) Renders Invisible White-on-White Text in Light Mode:** `Providers` (`frontend/src/components/providers.tsx:25`) enables `enableSystem` with `next-themes`, setting `<html class="light">` and `--color-background: #f8f9fa` (white) for any visitor whose OS uses Light Mode. Because `frontend/src/app/page.tsx:116`, `hero.tsx`, `feature-section.tsx`, and `community-marquee.tsx` use `bg-background` with hardcoded `text-white`, `text-white/70`, and `text-white/65` classes, the homepage is completely unreadable (contrast \~1.04:1) for light-mode visitors.

  2. **\[Critical | API-01\] Production `render.yaml` Crashes Bot and Worker Containers on Boot:** `backend/src/core/config.ts:81-87` requires `BACKEND_PROXY_SECRET` whenever `NODE_ENV=production` regardless of process role, but `backend/render.yaml:60-137` only provides `BACKEND_PROXY_SECRET` to the `dexbotx-zq8g` web service and omits it from `dexbotx-bot` and `dexbotx-worker`, causing both background services to crash immediately at startup.

  3. **\[Critical | SCALE-01\] Full Redis Session Keyspace `SCAN` + `MGET` on Every WebSocket Handshake:** `RealtimeGateway.handleConnection` (`backend/src/realtime/realtime.gateway.ts:84`) calls `SessionService.findActiveForUser(userId)` (`backend/src/auth/session.service.ts:78-96`), which ignores the per-user `usess:${userId}` index and instead runs a full `SCAN 0 MATCH sess:*` loop and `MGET`s + parses **every session in Redis** on every single WebSocket connection.

  4. **\[Critical | SCALE-02\] Global `discord:blocked_until` Circuit Breaker Triggered by Single-User or Single-Route 429s:** `DiscordRestService.request` (`backend/src/discord/discord-rest.service.ts:130-150`) sets the global Redis key `discord:blocked_until` on *any* HTTP 429 response from Discord—even when `global === false` (such as a single user's OAuth `/users/@me/guilds` token limit). This globally blocks uncached guild/channel fetches for all users and causes `GET /dexbotx/health` (`health.controller.ts:131-134`) to return HTTP `503`.

  5. **\[High | SEC-01 & SEC-02\] Next.js API Proxy Collapses Client IPs into Shared Rate-Limit Buckets and Buffers Unbounded Request Bodies in RAM:** `frontend/src/app/api/[[...path]]/route.ts:27-56` buffers arbitrary request bodies via `await request.arrayBuffer()` with no size ceiling or timeout before forwarding, and its server-to-server `fetch()` causes Express `req.ip` (with `TRUST_PROXY=2`) to resolve to the Next.js proxy's egress IP, collapsing anonymous rate limits across all users.

### 2. Findings Tables by Category

#### Category 1: Security (Frontend and Backend)

| ID | Severity | Location (File & Function/Lines) | Problem | Impact at Scale | Recommended Fix | 
| ----- | ----- | ----- | ----- | ----- | ----- | 
| **SEC-01** | **High** | `frontend/src/app/api/[[...path]]/route.ts` (`proxyRequest`, lines 27–56); `backend/src/common/request.guard.ts` (`RequestGuard.canActivate`, line 64); `backend/src/health/health.controller.ts` (`respond`, line 74) | Browser traffic is proxied server-to-server from Next.js (`fetch(target)`) to the backend behind Cloudflare/Render (`TRUST_PROXY=2`). Cloudflare sees the Next.js server as the client, so `req.ip` resolves to the Next.js egress IP (or, if `TRUST_PROXY` is raised, trusts unstripped client `X-Forwarded-For` headers). | All unauthenticated users (`/auth/login`, `/auth/callback`, `/invite`, `/bot/added`, `/dexbotx/health`) share one IP rate-limit bucket per Vercel region; 21 logins/min globally locks out all new logins with HTTP 429. | Strip client `x-forwarded-for` in `route.ts`, set a trusted `x-dexbotx-client-ip` header from the edge client IP alongside `x-dexbotx-proxy-secret`, and read `x-dexbotx-client-ip` in `RequestGuard` and `HealthController` when the proxy secret is valid. | 
| **SEC-02** | **High** | `frontend/src/app/api/[[...path]]/route.ts` (`proxyRequest`, lines 49–56) | `await request.arrayBuffer()` buffers the entire request payload in the Next.js process memory with no `Content-Length` check, no byte limit, and no `AbortSignal.timeout` on `fetch(target)`. | Concurrent multi-megabyte POSTs to `/api/*` exhaust Next.js container/serverless RAM (OOM DoS) before reaching NestJS's 32 KB / 2 MB body limits, and hung backend requests stall frontend workers indefinitely. | Reject requests with `Content-Length > 2_200_000` (HTTP 413) and enforce a streaming byte limit in `route.ts`, plus `signal: AbortSignal.timeout(15_000)` on `fetch(target)`. | 
| **SEC-03** | **High** | `backend/src/core/config.ts` (`PRODUCTION_BOT_PERMISSIONS`, lines 5, 165); `backend/render.yaml` (`BOT_PERMISSIONS`, line 18) | `PRODUCTION_BOT_PERMISSIONS` (`7049005315517686`) requests 26 permissions including `MANAGE_GUILD`, `MANAGE_CHANNELS`, `MANAGE_WEBHOOKS`, `MANAGE_MESSAGES`, and `VIEW_CREATOR_MONETIZATION_ANALYTICS`. `render.yaml:18` sets dead env var `BOT_PERMISSIONS: "268487688"` which includes `ADMINISTRATOR` (`1 << 3`). | Violates least privilege, contradicts public `/features` and `/faq` claims, expands blast radius if the bot token is compromised, and causes Discord Bot Verification rejection for unused privileged permissions. | Replace `PRODUCTION_BOT_PERMISSIONS` with the minimal required bitfield (`1099780442246`: `ViewChannel`, `SendMessages`, `EmbedLinks`, `AttachFiles`, `ReadMessageHistory`, `ViewAuditLog`, `ManageRoles`, `KickMembers`, `BanMembers`, `ModerateMembers`) and remove `BOT_PERMISSIONS` from `render.yaml`. | 
| **SEC-04** | **Medium** | `backend/src/realtime/realtime.gateway.ts` (`handleConnection` lines 68–107, `handleMessage` lines 113–145); `backend/src/auth/auth.service.ts` (`logout` lines 70–77); `backend/src/admin/admin-users-content.service.ts` (`revokeUser` lines 49–72) | `RealtimeGateway` validates the session only once during `handleConnection` and caches `socket.session` in memory. It never re-checks `expiresAt` or Redis session existence on subsequent `join` messages or pings, and `logout` / `revokeUser` do not close open WebSockets. | A user whose session is revoked by an admin or who logs out remains connected to live guild event streams and can join new guild rooms on an already-open socket until the TCP connection drops. | Store `sid` in `wsticket:${ticket}`, re-verify `await this.sessions.get(socket.sid)` on `join` messages and ping intervals, and publish a Redis `dexbotx:sessions:revoked` event on logout/revoke to terminate active sockets for that user/session. | 
| **SEC-05** | **Medium** | `backend/src/db/schema.ts` (lines 18, 29, 42, 54, 67, 80, 93, 108); `backend/drizzle/0000_swift_white_tiger.sql` – `0003_mod_actions.sql` | All 8 PostgreSQL tables enable Row-Level Security (`ENABLE ROW LEVEL SECURITY`), but zero `CREATE POLICY` statements exist. Queries only succeed because `DATABASE_URL` connects as the table owner / `postgres` superuser (`BYPASSRLS`). | Connecting the production app as a Postgres superuser/table owner violates least privilege; conversely, switching to a non-owner app role without `BYPASSRLS` breaks all SQL queries with default-deny RLS errors. | Add a SQL migration creating explicit permissive RLS policies for the dedicated backend database role while keeping Supabase `anon` and `authenticated` PostgREST roles denied. | 
| **SEC-06** | **Low** | `frontend/next.config.mjs` (`csp`, lines 33–45) | `script-src 'self' 'unsafe-inline'` permits inline script execution on all routes. | Weakens defense-in-depth against XSS if a third-party script or future component introduces an injection sink. | Audit inline scripts and consider Next.js experimental SRI or route-scoped CSP headers for `/dashboard` and `/admin`. | 
| **SEC-07** | **Low** | `backend/src/auth/session.service.ts` (`create`, lines 28–46); `backend/src/guilds/guilds.service.ts` (`getUserGuilds`, lines 181–185) | `token.refresh_token` is discarded on login; if Discord invalidates the access token before `sessionTtlSeconds` (7 days), `getUserGuilds` destroys the session on 401. | Forces users to log in again if Discord rotates or expires an access token early. | Optionally encrypt and store `refresh_token` in `SessionData` and attempt a token refresh on 401 before destroying the session. | 

#### Category 2: Backend API and Logic (NestJS)

| ID | Severity | Location (File & Function/Lines) | Problem | Impact at Scale | Recommended Fix | 
| ----- | ----- | ----- | ----- | ----- | ----- | 
| **API-01** | **Critical** | `backend/render.yaml` (`dexbotx-bot` lines 60–98, `dexbotx-worker` lines 100–137); `backend/src/core/config.ts` (`envSchema.superRefine`, lines 81–87) | `config.ts` requires `BACKEND_PROXY_SECRET` (min 32 chars) in production across all entrypoints (`main.ts`, `manager.ts`, `shard.ts`, `worker.ts`), but `render.yaml` only passes `BACKEND_PROXY_SECRET` to `dexbotx-zq8g` (API) and omits it from `dexbotx-bot` and `dexbotx-worker`. | `dexbotx-bot` and `dexbotx-worker` crash immediately in a boot loop on Render production deploys with `BACKEND_PROXY_SECRET: is required in production`. | Sync `BACKEND_PROXY_SECRET` from `dexbotx-zq8g` to `dexbotx-bot` and `dexbotx-worker` in `backend/render.yaml`, and scope the `BACKEND_PROXY_SECRET` requirement in `config.ts` to the `api` process role. | 
| **API-02** | **High** | `backend/src/guilds/guild-events.controller.ts` (`stream`, lines 17–23); `backend/src/guilds/guild-events.service.ts` (`stream`, lines 41–57); `backend/src/bot/guild-sync.service.ts` (`notifyReconciled`, lines 126–128) | `GuildEventsController.stream` filters `allowedGuildIds` to `guilds.filter((g) => g.botInstalled)`, excluding servers where the user is waiting for the bot to join. Additionally, `notifyReconciled()` publishes `'*'`, which `GuildEventsService.stream` drops because `allowedGuildIds.has('*')` is false. | SSE clients never receive `guilds_changed` events when the bot is newly added to one of their servers or when periodic shard reconciliation completes. | Pass `new Set(guilds.map((g) => g.id))` in `GuildEventsController.stream` and allow `data.guildId === '*'` in `GuildEventsService.stream`. | 
| **API-03** | **High** | `backend/src/app.setup.ts` (`configureApp`, lines 26–36); `backend/src/metrics/metrics.controller.ts` (`scrape`, lines 10–19) | `MetricsController` is designed to be scraped directly on the API using `Authorization: Bearer <METRICS_TOKEN>`, but `configureApp` blocks all production requests except `/dexbotx/health` unless `x-dexbotx-proxy-secret` is present. | Prometheus scraping `GET /metrics` directly on the production API fails with `403 Forbidden`. | Exempt \`(req.method === 'GET' | 
| **API-04** | **Medium** | `backend/src/discord/discord-rest.service.ts` (`canBotPost`, lines 238–248) | `canBotPost` only inspects overwrites for `@everyone` (`id === channel.guild_id`) and the bot's user ID (`id === discordClientId`), ignoring role overwrites (including the `DexBotX` role created by `ChannelAccessService`), base role permissions, and `Administrator`. | `/admin/servers/[guildId]` falsely reports `"Bot cannot post"` on announcement/welcome channels where `@everyone` is denied `SendMessages` but the `DexBotX` role is explicitly allowed. | Compute effective channel permissions following Discord's permission hierarchy (`@everyone` base $\rightarrow$ bot roles base $\rightarrow$ `@everyone` overwrite $\rightarrow$ bot roles overwrites $\rightarrow$ bot member overwrite). | 
| **API-05** | **Medium** | `backend/src/assets/assets.controller.ts` (`uploadBackground`, lines 29–46); `backend/src/welcome/welcome.service.ts` (`removeReplacedBackground`, lines 151–161) | `uploadBackground` writes `${guildId}/${hash}.jpg` to Supabase Storage immediately on upload, while `removeReplacedBackground` only deletes the previously *saved* DB path. Any uploaded image that is replaced before saving or discarded is orphaned forever. | Unbounded accumulation of orphaned JPEG files in Supabase Storage and slower `/admin/content` queries. | When saving or resetting in `WelcomeService`, list or track objects under `${guildId}/` and delete any object not referenced by `welcome.image.backgroundPath` or `goodbye.image.backgroundPath`. | 
| **API-06** | **Low** | `backend/src/core/config.ts` (`PRODUCTION_WEB_ORIGIN`, lines 4, 64–70); `backend/src/discord/onboarding.constants.ts` (line 21); `frontend/src/app/page.tsx` (line 110) | `PRODUCTION_WEB_ORIGIN` is hardcoded to `'https://dexbotx.vercel.app'` in `config.ts`, `onboarding.constants.ts`, and `page.tsx`. | Prevents running a staging environment with `NODE_ENV=production` or switching to a custom domain (`https://dexbotx.app`) without code changes. | Validate HTTPS and non-localhost in `config.ts` without hardcoding `dexbotx.vercel.app`, and interpolate `this.config.webOrigin` in `OnboardingService` and `SITE.siteUrl` in `page.tsx`. | 
| **API-07** | **Low** | `backend/src/db/schema.ts` (`guildTemplates` lines 56–67, `auditLogs` lines 70–80, `modActions` lines 95–108) | `guild_templates` table is unused in application code, and `audit_logs(user_id)` / `mod_actions(target_id)` have no secondary indexes. | Full table scans when querying audit/moderation history by user ID. | Add btree indexes on `audit_logs(user_id)` and `mod_actions(target_id)`. | 

#### Category 3: Rate Limiting, Caching, and Scaling

| ID | Severity | Location (File & Function/Lines) | Problem | Impact at Scale | Recommended Fix | 
| ----- | ----- | ----- | ----- | ----- | ----- | 
| **SCALE-01** | **Critical** | `backend/src/auth/session.service.ts` (`findActiveForUser`, lines 78–96); `backend/src/realtime/realtime.gateway.ts` (`handleConnection`, line 84); `backend/src/admin/admin-users-content.service.ts` (`revokeUser` lines 51–69, `activeSessionCount` lines 123–145) | `findActiveForUser(userId)` ignores the `usess:${userId}` Redis Set and runs a full `SCAN 0 MATCH sess:* COUNT 200` + `MGET` + `JSON.parse` over **every session in Redis**. It is called on **every WebSocket connection** (`RealtimeGateway.handleConnection`). `revokeUser` also runs `scanSessionKeys()` across all sessions before calling `destroyAllForUser`. | At 10k–100k sessions, every dashboard WebSocket connect/reconnect scans and deserializes the entire Redis session keyspace ($O(N_{\text{sessions}})$ per connection), saturating Redis and Node.js CPU during traffic spikes or deploys. | Store `{ userId, sid }` in `wsticket:${ticket}` so `RealtimeGateway` calls `this.sessions.get(sid)` in $O(1)$; rewrite `findActiveForUser` to use `SMEMBERS usess:${userId}`; and remove `scanSessionKeys()` from `revokeUser`. | 
| **SCALE-02** | **Critical** | `backend/src/discord/discord-rest.service.ts` (`request` lines 130–150, `getGuildChannels` lines 219–227); `backend/src/guilds/guilds.service.ts` (`getUserGuilds` lines 173–176); `backend/src/health/health.controller.ts` (`checkServices` lines 131–134) | `DiscordRestService.request` sets the global Redis key `discord:blocked_until` on *any* HTTP 429 from Discord, even when `body.global !== true` (e.g., a single user's OAuth `/users/@me/guilds` token limit or a single guild channel route limit). | One rate-limited user token or busy guild sets `discord:blocked_until`, blocking uncached dashboard loads for **all users globally** (HTTP 503/429) and turning `/dexbotx/health` unhealthy (HTTP 503). | Only set `discord:blocked_until` when `global === true`. For non-global 429s, set a scoped key (`discord:blocked:route:${route}` or `discord:blocked:oauth:${sha256Hex(accessToken)}`). | 
| **SCALE-03** | **High** | `backend/src/bot/bot.service.ts` (`onReady` lines 174–177, `syncAll` lines 196–201); `backend/src/bot/guild-sync.service.ts` (`syncGuild`, lines 162–280) | On shard startup (`onReady`) and every 3 hours (`syncTimer`), `syncAll` loops sequentially over every guild and calls `syncGuild(guild.id)`, which makes 3 Discord REST calls (`getGuildAsBot`, `getGuildChannels`, `getGuildRoles`) per guild instead of reading the Gateway `Guild` cache. Also `syncTimer` lacks `.unref()`. | At 1,000 guilds (10x), startup sync makes 3,000 sequential REST calls (\~20+ mins); at 10,000 guilds (100x), 30,000 REST calls exhaust Discord rate limits and block reconciliation. | Add `syncGuildFromGateway(guild: Guild)` in `GuildSyncService` to sync directly from the in-memory `Guild` (`guild.channels.cache`, `guild.roles.cache`) without REST calls, and call `this.syncTimer.unref()`. | 
| **SCALE-04** | **High** | `backend/src/queue/member-events.queue.ts` (`MemberEventsQueue`, lines 28–29); `backend/src/worker/member-events.processor.ts` (`MemberEventsProcessor`, lines 47–52, 84–87); `backend/src/redis/redis.service.ts` (`onApplicationShutdown`, lines 93–101) | BullMQ `Queue` and `Worker` share `this.redis.client` with application services. On shutdown, `RedisService.onApplicationShutdown` calls `this.client.quit()` concurrently with `this.worker.close()`, severing the Redis connection while active jobs are still finishing. | During rolling deploys, in-flight welcome/goodbye jobs fail mid-execution to `Connection is closed` after already posting to Discord, causing duplicate posts when retried. | Create a dedicated BullMQ Redis connection in `MemberEventsQueue` / `MemberEventsProcessor` (or close the worker/queue before `RedisService` quits its client). | 
| **SCALE-05** | **Medium** | `backend/src/admin/admin-users-content.service.ts` (`content`, lines 74–85); `backend/src/storage/asset-storage.service.ts` (`listBackgrounds`, lines 98–117) | `GET /admin/content` loads all rows from `guild_settings` without pagination and calls `listBackgrounds()`, which makes $N+1$ sequential HTTP POST calls to Supabase Storage (one per guild folder). | At 500+ guilds with custom backgrounds, `/admin/content` makes 500+ sequential HTTP requests and times out. | Bound concurrency in `listBackgrounds()` with `Semaphore(10)` and cache the result in Redis (`admin:content`, 60s TTL). | 
| **SCALE-06** | **Medium** | `backend/src/health/health.controller.ts` (`takeRateLimit`, lines 48, 87–99) | `HealthController` uses an unbounded in-memory `Map` and iterates all entries on every request. | Under a spoofed-IP flood, the map grows unbounded for 60s and is not shared across API instances. | Cap `this.rateLimits.size` at 5,000 entries (evicting oldest key) in `takeRateLimit`. | 
| **SCALE-07** | **Low** | `backend/src/worker/worker.ts` (`publishHeartbeat`, lines 25–36) | All worker replicas overwrite the single `hb:worker` Redis key. | If one of multiple worker replicas hangs, other replicas keep `hb:worker` green, hiding dead workers. | Write both `hb:worker` and per-instance `hb:worker:${process.pid}` heartbeats. | 

#### Category 4: Frontend (Next.js): SEO

| ID | Severity | Location (File & Function/Lines) | Problem | Impact at Scale | Recommended Fix | 
| ----- | ----- | ----- | ----- | ----- | ----- | 
| **SEO-01** | **High** | `frontend/src/app/page.tsx` (`dynamic = 'force-dynamic'`, line 17; `Home`, lines 67–99, 117–133) | The root landing page (`/`) is forced to `dynamic = 'force-dynamic'` solely to read `?error=` and `?notice=` query parameters on the server. | Every visitor and search-engine crawler hitting `/` bypasses static CDN caching and triggers a cold/warm SSR invocation, hurting TTFB and LCP and increasing Vercel serverless costs. | Remove `export const dynamic = 'force-dynamic'` and `searchParams` from `page.tsx` so `/` builds as a static (SSG) page, and move the `?error=` / `?notice=` alert banner into a `<Suspense>` client component using `useSearchParams()`. | 
| **SEO-02** | **High** | `frontend/src/components/home/community-marquee.tsx` (lines 35–43); `frontend/src/assets/marqueshowcase/*`; `frontend/src/components/site-footer.tsx` (lines 16–24); `frontend/public/dexbotx-banner*.gif` | `CommunityMarquee` loads 3.4+ MB of unoptimized animated GIFs (`Seoul Anime Cafe.gif` 1.3 MB, `Mumbai Esports Arena.gif` 1.1 MB, `chillamchilli.gif` 924 KB) on `/` to render 44×44px icons. `SiteFooter` sets `loading="eager"` on the 342 KB footer mascot image across all public pages. `frontend/public/` also contains 11.6 MB of unused banner GIFs. | Degrades mobile LCP and page weight (>4.5 MB transferred on initial homepage load) and wastes bandwidth on below-the-fold assets. | Remove `loading="eager"` from `SiteFooter` (`site-footer.tsx:22`), convert marquee icons to 88×88 WebP/AVIF, and delete unused `dexbotx-banner*.gif` and duplicate root assets. | 
| **SEO-03** | **Medium** | `frontend/src/app/page.tsx` (lines 102–114); `frontend/src/components/seo/json-ld.tsx` (`SiteStructuredData`, lines 56–65); `frontend/src/lib/site.ts` (lines 21–28); `frontend/.env.example` (line 14) | `page.tsx:102-113` outputs an inline `@type: 'WebSite'` JSON-LD script duplicating `SiteStructuredData` (`json-ld.tsx:56-65`). Additionally, `.env.example:14` sets `NEXT_PUBLIC_YOUTUBE_PROFILE_URL=youtube.com/@dexgamexx1` without `https://`, and `site.ts` does not normalize it, producing a broken relative link on `/about` and in `SiteFooter` plus invalid `sameAs` schema URLs. | Duplicate `WebSite` structured data and broken relative links (`/youtube.com/@dexgamexx1` $\rightarrow$ 404) hurt crawl quality and schema validation. | Delete the duplicate `<script type="application/ld+json">` in `page.tsx:102-113`, normalize profile URLs in `frontend/src/lib/site.ts` to ensure `https://`, and update `frontend/.env.example:14`. | 
| **SEO-04** | **Low** | `frontend/src/app/not-found.tsx` (lines 18, 30, 31); `frontend/src/app/opengraph-image.tsx`; `frontend/src/lib/site.ts` (`keywords`, lines 35–59) | `not-found.tsx` renders three `<h1>` elements on the same page with hostile copy ("Nice try, script kiddie..."), which is also shown when non-admins visit `/admin`. `opengraph-image.tsx` is unused because `createPageMetadata` overrides `openGraph.images` with `/assets/dexbotx-og-banner.jpg`. `SITE.keywords` contains duplicate strings. | Multiple `<h1>` tags violate heading hierarchy; hostile 404 copy alienates users mistyping a URL. | Keep a single `<h1>` in `not-found.tsx` with professional copy, deduplicate `SITE.keywords`, and remove or wire `opengraph-image.tsx`. | 

#### Category 5: Frontend: UI/UX

| ID | Severity | Location (File & Function/Lines) | Problem | Impact at Scale | Recommended Fix | 
| ----- | ----- | ----- | ----- | ----- | ----- | 
| **UX-01** | **Critical** | `frontend/src/components/providers.tsx` (line 25); `frontend/src/app/globals.css` (lines 32–55); `frontend/src/app/page.tsx` (lines 116–202); `frontend/src/components/home/hero.tsx`; `frontend/src/components/home/feature-section.tsx`; `frontend/src/components/home/community-marquee.tsx`; `frontend/src/components/site-footer.tsx` (lines 9, 70) | `ThemeProvider` enables `enableSystem` and `themes={['light', 'dark']}`. When `html.light` is active (either via OS Light Mode preference or toggling the theme in the dashboard), `--color-background` becomes `#f8f9fa` (white). However, `<main className="... bg-background">` on `/` and `SiteFooter` use `bg-background` while all child headings, paragraphs, badges, tables, and cards hardcode `text-white`, `text-white/70`, `text-white/65`, and `border-white/10`. | Every visitor with OS Light Mode enabled (or returning from light-mode dashboard) sees white text on a white `#f8f9fa` background across the entire homepage (`/`), making the landing page completely unreadable (WCAG contrast \~1.04:1). | Replace hardcoded `text-white/*`, `border-white/*`, and `bg-white/*` classes in `page.tsx`, `hero.tsx`, `feature-section.tsx`, `community-marquee.tsx`, and `site-footer.tsx` with theme-aware semantic classes (`text-foreground`, `text-muted-foreground`, `border-border`, `bg-card`), or scope the public landing page to a fixed dark theme surface. | 
| **UX-02** | **Medium** | `frontend/src/app/admin/servers/page.tsx` (lines 141–220); `frontend/src/app/admin/servers/[guildId]/page.tsx` (lines 233–271) | The server detail drawer and confirmation modals in `/admin/servers` and `/admin/servers/[guildId]` use `role="dialog" aria-modal="true"` but lack `Escape` key handlers, initial focus management, and `Tab` focus trapping. | Fails WCAG 2.2 AA 2.1.1 (Keyboard) and 2.4.3 (Focus Order); keyboard users can tab into background elements behind modal dialogs. | Add a focus-trap and `Escape`-to-close hook (matching `frontend/src/components/dashboard/mobile-nav.tsx:17-48`) to the admin drawer and confirmation dialogs. | 
| **UX-03** | **Medium** | `frontend/src/app/admin/servers/[guildId]/page.tsx` (`submitMessage`, lines 61–108); `frontend/src/store/adminApi.ts` | `submitMessage` calls `fetch('/api/admin/guilds/.../message')` directly instead of using an RTK Query mutation in `adminApi`, so `AdminAudit` and `AdminGuild` cache tags are not invalidated. | Admin audit log (`/admin/audit`) displays stale data after sending a guild message until the browser is refreshed. | Add a `sendGuildMessage` mutation to `adminApi` with `invalidatesTags: ['AdminAudit', { type: 'AdminGuild', id }]` and use it in `AdminServerDetailPage`. | 
| **UX-04** | **Low** | `frontend/src/components/home/feature-section.tsx` (line 147); `frontend/src/app/dashboard/page.tsx` | Typo in main feature headline: `"Every Tools you need to grow your community server"`. Additionally, `/dashboard` never subscribes to the backend `@Sse('events/guilds')` stream unless polling via `?added=`. | Grammatical error in a 6xl headline on `/`; server list does not live-update when the bot is added or removed in another tab. | Fix `"Every Tools"` to `"Every tool"` in `feature-section.tsx:147` and connect an `EventSource('/api/events/guilds')` in `dashboard/page.tsx` to invalidate the `Guilds` tag. | 

#### Category 6: Production Readiness

| ID | Severity | Location (File & Function/Lines) | Problem | Impact at Scale | Recommended Fix | 
| ----- | ----- | ----- | ----- | ----- | ----- | 
| **OPS-01** | **High** | `frontend/src/app/error.tsx`; `backend/src/bot/shard.ts`; `backend/src/bot/bot.service.ts` (`safe`, lines 134–140) | Sentry is initialized in `backend/src/main.ts` and `backend/src/worker/worker.ts`, but **not** in `backend/src/bot/shard.ts` or `BotService.safe()`, and the frontend has no error reporting in `error.tsx` and no `frontend/src/app/global-error.tsx` boundary for root layout crashes. | Unhandled exceptions in Discord bot shards (`shard.ts`) and all frontend client crashes are invisible to error tracking. | Initialize `@sentry/node` in `backend/src/bot/shard.ts` and capture exceptions in `BotService.safe()`, and add `frontend/src/app/global-error.tsx`. | 
| **OPS-02** | **Medium** | `frontend/vitest.config.mts` (line 6); `frontend/src/**/*.spec.ts` | Frontend tests only cover pure `.ts` utility modules in ` environment: 'node'`. Zero tests exist for React components (`MessageEditor`, `DashboardAuthGate`, `AdminGate`, `useCardPreview`, `BackgroundUpload`) or pages. | UI/UX regressions (such as `UX-01` light-mode invisibility or broken modal interactions) ship to production without CI detection. | Add component tests (or Playwright e2e smoke tests) for `DashboardAuthGate`, `AdminGate`, `MessageEditor`, and public page rendering in both dark and light themes. | 
| **OPS-03** | **Medium** | `backend/src/db/schema.ts` (lines 70–108); `frontend/src/app/privacy/page.tsx` (lines 47–53) | `audit_logs`, `admin_audit`, and `mod_actions` grow indefinitely with no TTL/retention job, and there is no admin endpoint or automated job to purge stored guild/user data upon a privacy deletion request (Discord Developer Policy requirement). | Unbounded Postgres table growth and manual database intervention required for user/guild data deletion requests. | Add an admin data-purge endpoint (`DELETE /admin/guilds/:id/purge`) and a scheduled retention cleanup for `audit_logs` and `mod_actions` older than 180 days. | 
| **OPS-04** | **Low** | `backend/src/core/core.module.ts` (line 33); `Readme.md` (line 116); `backend/Dockerfile` (lines 28–29) | `core.module.ts:33` ignores \`/^/(health | metrics)/`in`pinoHttp.autoLogging`, which does **not** match the actual health route `/dexbotx/health`. Root `Readme.md:116`also documents non-existent`GET /health`and`GET /health/ready\` endpoints. | Every 15s health check to `/dexbotx/health` logs an HTTP access line in production logs. | 

### 3. What Is Done Well

* **Exemplary OAuth2 & Session Cryptography (`backend/src/auth/`, `backend/src/shared/crypto.ts`):** Discord OAuth2 state is bound to the browser via an `httpOnly` cookie and single-use Redis key (`oauth:state:*`); post-login `returnTo` is strictly allowlisted (`safeReturnTo`); Discord access tokens are encrypted at rest with `AES-256-GCM` (`v1.<iv>.<tag>.<ciphertext>`); and session cookies use `__Host-dexbotx_sid` while Redis stores only `sha256(sid)` so a Redis dump cannot be replayed as a cookie.

* **Image Upload Hardening (`backend/src/assets/background-image.ts`, `backend/src/render/asset-fetcher.service.ts`):** `probeImage()` inspects PNG, JPEG, and WebP header dimensions *before* decoding pixels to defeat decompression bombs (`MAX_SIDE = 4096`, `MAX_PIXELS = 16_000_000`), re-encodes uploads through `@napi-rs/canvas` to strip EXIF/polyglot payloads, and `AssetFetcher` restricts outbound fetches to `cdn.discordapp.com` and `media.discordapp.net` with `redirect: 'error'` to prevent SSRF.

* **Discord Mass-Mention & Role-Hierarchy Defenses (`backend/src/shared/placeholders.ts`, `backend/src/bot/commands/moderation.guard.ts`):** `allowed_mentions: { parse: [], users }` is enforced on every REST and Gateway message send; `escapeMarkdown()` defuses `@everyone`/`@here` with a zero-width space; and `moderationGuard()` thoroughly checks moderator permissions, bot permissions, server ownership, self-moderation, and role hierarchy positions.

* **Process Isolation & Backpressure (`backend/src/bot/`, `backend/src/worker/`, `backend/src/render/render.service.ts`):** Separating the Gateway shard (`bot`), CPU-intensive canvas renderer (`worker` with `Semaphore(4)` and BullMQ 15s deduplication buckets), and HTTP `api` prevents canvas rendering from blocking Discord Gateway heartbeats.

* **Automated Security & Integration Testing Pipeline (`.github/workflows/`, `backend/test/api.e2e-spec.ts`):** CI runs CodeQL, Semgrep with custom taint rules (`.semgrep.yml`), Gitleaks across full git history (`gitleaks.toml`), `npm audit`, and a 1,956-line end-to-end test suite against real embedded PostgreSQL and Redis.

### 4. Prioritized Roadmap

#### Fix Now (Before Public Launch)

1. **Fix Light-Mode Invisible Text on `/` (`UX-01`):** Replace hardcoded `text-white/*`, `border-white/*`, and `bg-white/*` classes in `page.tsx`, `hero.tsx`, `feature-section.tsx`, `community-marquee.tsx`, and `site-footer.tsx` with theme-aware semantic tokens (or lock the public landing page surface to dark mode).

2. **Fix `render.yaml` & `config.ts` `BACKEND_PROXY_SECRET` Crash (`API-01`):** Add `BACKEND_PROXY_SECRET` to `dexbotx-bot` and `dexbotx-worker` in `backend/render.yaml` and scope the production check in `backend/src/core/config.ts` to the `api` role.

3. **Eliminate Full Redis Keyspace `SCAN` on WebSocket Connect & User Revoke (`SCALE-01`):** Store `{ userId, sid }` in `wsticket:${ticket}`, rewrite `SessionService.findActiveForUser` to use `SMEMBERS usess:${userId}`, and remove `scanSessionKeys()` from `AdminUsersContentService.revokeUser`.

4. **Scope `discord:blocked_until` to Global 429s Only (`SCALE-02`):** Only set the global `discord:blocked_until` key when Discord returns `global: true` on a 429 response; use route- or token-scoped keys for non-global 429s.

5. **Harden Next.js API Proxy Client IP & Body Limits (`SEC-01`, `SEC-02`):** Forward verified client IPs via `x-dexbotx-client-ip`, enforce a 2.2 MB body ceiling and 15s timeout in `frontend/src/app/api/[[...path]]/route.ts`, and trim production bot permissions (`SEC-03`).

#### Fix Soon (First Month)

1. **Replace Startup REST Sync Loop with Gateway Cache Sync (`SCALE-03`):** Sync guilds, channels, and roles directly from `ready.guilds.cache` on `ClientReady` instead of firing 3 REST requests per guild.

2. **Isolate BullMQ Redis Connections & Fix SSE / Metrics Routing (`SCALE-04`, `API-02`, `API-03`):** Give BullMQ dedicated Redis connections, fix SSE `allowedGuildIds` and `'*'` filtering, and exempt `/metrics` from the proxy secret middleware in `app.setup.ts`.

3. **Make `/` Static (SSG) & Optimize Marquee/Footer Assets (`SEO-01`, `SEO-02`, `SEO-03`):** Move the homepage `?error=`/`?notice=` banner into a `<Suspense>` client component, convert the 3.4 MB marquee GIFs to WebP, remove `loading="eager"` from the footer mascot, and fix `site.ts` URL normalization.

4. **Fix WebSocket Session Re-Validation, `canBotPost`, & Admin Dialog A11y (`SEC-04`, `API-04`, `UX-02`, `UX-03`, `OPS-01`):** Re-verify sessions on WebSocket `join`/ping, fix role overwrite calculation in `canBotPost`, add focus trapping to admin modals, and wire Sentry in `shard.ts` and `global-error.tsx`.

#### Fix Later (Ongoing Maturity)

1. **Database RLS Policies, Retention & Orphan Cleanup (`SEC-05`, `API-05`, `API-07`, `OPS-03`):** Add explicit RLS policies for a least-privilege DB role, prune orphaned Supabase backgrounds on save, add indexes on `audit_logs(user_id)` and `mod_actions(target_id)`, and implement scheduled audit-log retention and GDPR guild/user data purge endpoints.

2. **Frontend Component Tests, CSP Tightening & Minor Polish (`SEC-06`, `SEC-07`, `SCALE-05`, `SCALE-06`, `SCALE-07`, `SEO-04`, `UX-04`, `OPS-02`, `OPS-04`):** Add Vitest/Playwright component tests, bound `listBackgrounds()` concurrency, fix `core.module.ts` health log ignore regex, and clean up 404 page headings and copy.

## Part 2: GitHub Copilot Fix Prompts

### Critical Findings

#### Prompt 1 — \[UX-01\] Fix Light-Mode Invisible White-on-White Text on Public Landing Page and Footer

```
Finding ID: UX-01 (Critical)
Files & Functions to Change:
- frontend/src/app/page.tsx (Home component)
- frontend/src/components/home/hero.tsx (HomeHero component)
- frontend/src/components/home/feature-section.tsx (FeatureHighlight, FeatureCard, HomeFeatureSection components)
- frontend/src/components/home/community-marquee.tsx (CommunityMarquee component)
- frontend/src/components/site-footer.tsx (SiteFooter component)

Problem:
Providers (frontend/src/components/providers.tsx:25) configures next-themes with enableSystem=true and themes=['light', 'dark']. When a visitor's OS prefers light mode or they switch to light mode in the dashboard, html.light sets --color-background to #f8f9fa (near-white). Because <main className="relative isolate overflow-hidden bg-background"> in frontend/src/app/page.tsx and <footer className="... bg-background"> in frontend/src/components/site-footer.tsx use bg-background while all text, badges, tables, and cards inside page.tsx, hero.tsx, feature-section.tsx, and community-marquee.tsx hardcode text-white, text-white/70, text-white/65, border-white/10, and bg-white/[0.04], the entire landing page renders white text on a white background (contrast ~1.04:1).

Desired Behavior (Ordered Steps):
Step 1 (Landing Page & Hero — frontend/src/app/page.tsx and frontend/src/components/home/hero.tsx):
- Lock the public marketing landing page and footer to the dark surface palette (matching PublicSiteHeader in frontend/src/components/public-site-header.tsx which uses bg-[#10111d]) OR replace hardcoded white utilities with semantic theme variables. Specifically, to preserve the dark space/glow aesthetic on the marketing homepage in both light and dark OS modes, change <main className="relative isolate overflow-hidden bg-background"> in frontend/src/app/page.tsx (line 116) to <main className="relative isolate overflow-hidden bg-[#171717] text-[#e8eaed]"> and replace text-foreground in the comparison table row (line 181) with text-white.
Step 2 (Footer — frontend/src/components/site-footer.tsx):
- In SiteFooter (frontend/src/components/site-footer.tsx:9, 70), replace border-white/10 with border-border and text-white/55 (line 70) with text-muted-foreground so the footer remains legible on all public pages (/about, /faq, /commands, /features, /privacy, /terms) in both light and dark themes.

Constraints:
- Keep existing layout, animations, and dark-mode visual appearance unchanged.
- Follow existing Tailwind CSS v4 token patterns in frontend/src/app/globals.css.
- TypeScript strict mode; no new dependencies.

Acceptance Criteria & How to Test:
1. Open http://localhost:3000 with html.light active (toggle light theme in /dashboard or emulate prefers-color-scheme: light in DevTools).
2. Verify that all headings, body copy, marquee cards, feature cards, "How to add" steps, comparison table rows, and footer copyright text on /, /about, /faq, /commands, and /features meet WCAG 2.2 AA (>= 4.5:1) contrast.
3. Run: cd frontend && npm run lint && npm run typecheck && npm test && npm run build

```

#### Prompt 2 — \[API-01\] Fix Production `render.yaml` Missing `BACKEND_PROXY_SECRET` on Bot and Worker Services

```
Finding ID: API-01 (Critical)
Files & Functions to Change:
- backend/src/core/config.ts (envSchema.superRefine, loadConfig)
- backend/src/core/config.spec.ts
- backend/render.yaml (services: dexbotx-bot, dexbotx-worker)

Problem:
In backend/src/core/config.ts (lines 81–87), envSchema.superRefine requires BACKEND_PROXY_SECRET whenever NODE_ENV === 'production', regardless of which process is booting. However, backend/render.yaml only defines BACKEND_PROXY_SECRET on the web service (dexbotx-zq8g) and omits it from dexbotx-bot and dexbotx-worker. On Render in production, both dexbotx-bot and dexbotx-worker call loadConfig() at startup and crash immediately with "BACKEND_PROXY_SECRET: is required in production".

Desired Behavior:
1. In backend/render.yaml, add BACKEND_PROXY_SECRET (referencing fromService: type: web, name: dexbotx-zq8g, envVarKey: BACKEND_PROXY_SECRET) to both dexbotx-bot and dexbotx-worker envVars, and remove the unused BOT_PERMISSIONS key from dexbotx-backend-shared.
2. In backend/src/core/config.ts (loadConfig and envSchema), only require BACKEND_PROXY_SECRET in production when the process role is the HTTP API (i.e., when !env.DEXBOTX_PROCESS_ROLE || env.DEXBOTX_PROCESS_ROLE === 'api'). Non-HTTP processes (DEXBOTX_PROCESS_ROLE === 'worker', 'bot', or 'shard*') and backend/src/bot/manager.ts (set process.env.DEXBOTX_PROCESS_ROLE = 'bot' before loadConfig()) should not crash if BACKEND_PROXY_SECRET is omitted.

Constraints:
- Keep existing behavior for the API process (API must still fail fast in production if BACKEND_PROXY_SECRET is missing or < 32 chars).
- Follow existing Zod validation patterns in backend/src/core/config.ts.
- TypeScript strict mode; no new dependencies.

Acceptance Criteria & How to Test:
1. Add a unit test in backend/src/core/config.spec.ts verifying that loadConfig({ ...valid, BACKEND_PROXY_SECRET: '' }) throws when DEXBOTX_PROCESS_ROLE is 'api' or unset, and succeeds when DEXBOTX_PROCESS_ROLE is 'worker' or 'bot'.
2. Run: cd backend && npm test && npm run typecheck

```

#### Prompt 3 — \[SCALE-01\] Eliminate Full Redis Keyspace `SCAN` + `MGET` on WebSocket Connect and User Session Revocation

```
Finding ID: SCALE-01 (Critical)
Files & Functions to Change:
- backend/src/auth/session.service.ts (SessionService.findActiveForUser)
- backend/src/realtime/realtime.controller.ts (RealtimeController.createTicket)
- backend/src/realtime/realtime.gateway.ts (RealtimeGateway.handleConnection)
- backend/src/realtime/realtime.gateway.spec.ts
- backend/src/admin/admin-users-content.service.ts (AdminUsersContentService.revokeUser)

Problem:
1. SessionService.findActiveForUser(userId) (backend/src/auth/session.service.ts:78-96) runs a full Redis keyspace SCAN (MATCH sess:* COUNT 200) and MGETs + JSON.parses every active session in Redis, ignoring the per-user Redis Set usess:${userId} maintained by SessionService.create().
2. RealtimeGateway.handleConnection (backend/src/realtime/realtime.gateway.ts:84) calls findActiveForUser(userId) on every single WebSocket connection.
3. AdminUsersContentService.revokeUser (backend/src/admin/admin-users-content.service.ts:49-72) also scans the entire sess:* keyspace in memory before calling this.sessions.destroyAllForUser(userId).

Desired Behavior (Ordered Steps):
Step 1 (SessionService.findActiveForUser — backend/src/auth/session.service.ts):
- Rewrite findActiveForUser(userId: string) to read hashes = await this.redis.client.smembers(this.userIndexKey(userId)).
- If hashes.length === 0, return null.
- Fetch only those keys via this.redis.client.mget(...hashes.map((h) => `sess:${h}`)).
- Collect any stale hashes whose session key is null or expired, remove them via this.redis.client.srem(this.userIndexKey(userId), ...staleHashes), and return the first valid SessionData with expiresAt > Date.now() (or null).

Step 2 (RealtimeController & RealtimeGateway — backend/src/realtime/):
- In RealtimeController.createTicket, if req.sid is present, store JSON.stringify({ userId: req.session!.userId, sid: req.sid }) (or keep backward compatibility if a plain userId string is stored in tests) in wsticket:${ticket}.
- In RealtimeGateway.handleConnection, parse the ticket value: if sid is present, call await this.sessions.get(sid) (O(1) single Redis GET) and verify session.userId === userId; otherwise fall back to await this.sessions.findActiveForUser(userId).

Step 3 (AdminUsersContentService.revokeUser — backend/src/admin/admin-users-content.service.ts):
- Remove the full scanSessionKeys() + mget loop from revokeUser(adminId, userId) and rely directly on const revoked = await this.sessions.destroyAllForUser(userId).

Constraints:
- Keep existing public method signatures and return shapes intact.
- Preserve compatibility with existing unit and e2e tests in backend/src/realtime/realtime.gateway.spec.ts and backend/test/api.e2e-spec.ts.
- TypeScript strict mode; no new dependencies.

Acceptance Criteria & How to Test:
1. Verify that SessionService.findActiveForUser never calls redis.client.scan.
2. Verify that AdminUsersContentService.revokeUser revokes all sessions for a user via destroyAllForUser in O(user_sessions) time.
3. Run: cd backend && npm test && npm run test:e2e

```

#### Prompt 4 — \[SCALE-02\] Scope `discord:blocked_until` to Global 429s Only so Single-User or Single-Route Rate Limits Do Not Take Down the Platform

```
Finding ID: SCALE-02 (Critical)
Files & Functions to Change:
- backend/src/discord/discord-rest.service.ts (DiscordRestService.request, getGuildChannels)
- backend/src/guilds/guilds.service.ts (GuildsService.getUserGuilds)

Problem:
In backend/src/discord/discord-rest.service.ts (lines 130–150), whenever any Discord API call returns HTTP 429, request() unconditionally sets the global Redis key discord:blocked_until. Even if global === false (for example, a single user's OAuth bearer token is rate-limited on /users/@me/guilds, or one guild's channel endpoint hits a per-route bucket), setting discord:blocked_until causes GuildsService.getUserGuilds() and DiscordRestService.getGuildChannels() to reject requests for ALL users across the entire platform and causes GET /dexbotx/health to return 503 Service Unavailable.

Desired Behavior:
1. In DiscordRestService.request (backend/src/discord/discord-rest.service.ts:130-150):
   - Always push the event to stat:ev:d429 and increment d_429.
   - Only set the global key discord:blocked_until when global === true (or res.headers.get('x-ratelimit-scope') === 'global').
   - When global is false, set a route-scoped cooldown key instead:
     - If the request uses a Bearer token (OAuth user request), set discord:blocked:user:${sha256Hex(authHeader)} with TTL Math.max(1, Math.ceil(retryAfter)).
     - If the request uses the Bot token on a guild channel route (/guilds/${guildId}/channels), set discord:blocked:channels:${guildId} with TTL Math.max(1, Math.ceil(retryAfter)).
2. In DiscordRestService.getGuildChannels(guildId):
   - Check both discord:blocked_until and discord:blocked:channels:${guildId} before calling Discord REST.
3. In GuildsService.getUserGuilds(session, sid):
   - Check both discord:blocked_until and discord:blocked:user:${sha256Hex(`Bearer ${this.sessions.accessToken(session)}`)} before calling Discord REST.

Constraints:
- Keep existing behavior when Discord returns global: true (as tested in backend/test/api.e2e-spec.ts:120 and 1066).
- Follow existing error handling and logging conventions.
- TypeScript strict mode; no new dependencies.

Acceptance Criteria & How to Test:
1. Global 429 responses (global: true) still set discord:blocked_until and pass the existing e2e test at backend/test/api.e2e-spec.ts:1066.
2. Non-global 429 responses (global: false) only block the affected guild route or OAuth user token without setting discord:blocked_until or failing /dexbotx/health.
3. Run: cd backend && npm test && npm run test:e2e

```

### High Findings

#### Prompt 5 — \[SEC-01 & SEC-02\] Forward Trusted Client IP Through Next.js Proxy and Enforce Request Body Size & Timeout Limits

```
Finding ID: SEC-01, SEC-02 (High)
Files & Functions to Change:
- frontend/src/app/api/[[...path]]/route.ts (proxyRequest)
- frontend/src/app/api/[[...path]]/route.spec.ts
- backend/src/app.setup.ts (BACKEND_CLIENT_IP_HEADER)
- backend/src/common/request.guard.ts (RequestGuard.canActivate)
- backend/src/health/health.controller.ts (HealthController.respond)

Problem:
1. (SEC-01) All browser API requests go through Next.js route.ts (fetch(target)), which makes a server-to-server HTTP call to the backend. Behind Cloudflare/Render (TRUST_PROXY=2), Express req.ip resolves to the Next.js server's egress IP rather than the browser's IP, collapsing anonymous rate limits across all users.
2. (SEC-02) route.ts calls await request.arrayBuffer() without checking Content-Length or enforcing a byte limit or fetch timeout, allowing large POST bodies to exhaust Next.js memory before reaching the backend.

Desired Behavior:
1. In frontend/src/app/api/[[...path]]/route.ts:
   - Define MAX_PROXY_BODY_BYTES = 2 * 1024 * 1024 + 65536 (2.06 MB, slightly above the 2 MB background upload limit).
   - For non-GET/HEAD requests, check Number(request.headers.get('content-length') ?? 0) > MAX_PROXY_BODY_BYTES and return Response.json({ statusCode: 413, message: 'Payload Too Large' }, { status: 413 }) before reading the body. After reading const bodyBuffer = await request.arrayBuffer(), also check bodyBuffer.byteLength > MAX_PROXY_BODY_BYTES and return 413.
   - Extract the client IP from request.headers.get('x-real-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim(). Delete client-supplied x-dexbotx-client-ip, and if a client IP was found, set headers.set('x-dexbotx-client-ip', clientIp).
   - Add signal: AbortSignal.timeout(15_000) to fetch(target, ...) (except when path.join('/') === 'events/guilds' for SSE).
2. In backend/src/common/request.guard.ts and backend/src/health/health.controller.ts:
   - Read const clientIp = (this.config.isProd ? req.get('x-dexbotx-client-ip') : undefined) || req.ip || 'unknown' so rate limiting uses the verified browser IP forwarded by the authenticated Next.js proxy.

Constraints:
- Keep existing behavior for all existing unit and e2e tests.
- TypeScript strict mode; no new dependencies.

Acceptance Criteria & How to Test:
1. Add unit tests in frontend/src/app/api/[[...path]]/route.spec.ts verifying that bodies exceeding MAX_PROXY_BODY_BYTES return 413 without calling fetch, and that x-dexbotx-client-ip is set from x-forwarded-for / x-real-ip and cannot be forged when x-forwarded-for is absent.
2. Run: cd frontend && npm test && cd ../backend && npm test

```

#### Prompt 6 — \[SEC-03\] Reduce Production Bot Invite Permissions to Minimal Required Bitfield

```
Finding ID: SEC-03 (High)
Files & Functions to Change:
- backend/src/core/config.ts (PRODUCTION_BOT_PERMISSIONS, DEVELOPMENT_BOT_PERMISSIONS)
- backend/src/core/config.spec.ts
- backend/.env.example
- backend/README.md

Problem:
backend/src/core/config.ts sets PRODUCTION_BOT_PERMISSIONS = '7049005315517686', which requests 26 permissions including MANAGE_GUILD, MANAGE_CHANNELS, MANAGE_WEBHOOKS, MANAGE_MESSAGES, MUTE_MEMBERS, DEAFEN_MEMBERS, MOVE_MEMBERS, and VIEW_CREATOR_MONETIZATION_ANALYTICS. The bot never uses these permissions.

Desired Behavior:
1. In backend/src/core/config.ts, align PRODUCTION_BOT_PERMISSIONS with DEVELOPMENT_BOT_PERMISSIONS ('1099780443270', which grants only KICK_MEMBERS, BAN_MEMBERS, VIEW_AUDIT_LOG, VIEW_CHANNEL, SEND_MESSAGES, EMBED_LINKS, ATTACH_FILES, READ_MESSAGE_HISTORY, USE_EXTERNAL_EMOJIS, MANAGE_ROLES, and MODERATE_MEMBERS).
2. Update backend/src/core/config.spec.ts (line 25), backend/.env.example (line 38), and backend/README.md (line 62) to reflect the unified minimal permission bitfield.

Constraints:
- Keep existing config loading and validation behavior.
- TypeScript strict mode; no new dependencies.

Acceptance Criteria & How to Test:
1. Run: cd backend && npm test && npm run typecheck
2. Verify loadConfig() returns botPermissions === '1099780443270' in both development and production.

```

#### Prompt 7 — \[API-02\] Fix SSE Guild Events Stream Filtering for Uninstalled Guilds and Reconciliation Broadcasts

```
Finding ID: API-02 (High)
Files & Functions to Change:
- backend/src/guilds/guild-events.controller.ts (GuildEventsController.stream)
- backend/src/guilds/guild-events.service.ts (GuildEventsService.stream)
- backend/src/guilds/guild-events.service.spec.ts

Problem:
1. GuildEventsController.stream (backend/src/guilds/guild-events.controller.ts:20) passes new Set(guilds.filter((guild) => guild.botInstalled).map((guild) => guild.id)) to GuildEventsService.stream(). When a user is on the dashboard waiting for the bot to join a server where botInstalled is currently false, that guildId is excluded, so the SSE stream drops the guilds_changed event when the bot joins.
2. GuildSyncService.notifyReconciled() publishes '*' to GUILD_MEMBERSHIP_EVENTS_CHANNEL, which GuildEventsService.stream() drops because allowedGuildIds.has('*') is false.

Desired Behavior:
1. In backend/src/guilds/guild-events.controller.ts (line 20), pass all manageable guild IDs for the user: new Set(guilds.map((guild) => guild.id)).
2. In backend/src/guilds/guild-events.service.ts (lines 44–54), allow events where data.guildId === '*' (when event.type === 'guilds_changed' and allowedGuildIds.size > 0) in addition to allowedGuildIds.has(data.guildId).

Constraints:
- Keep authorization strict: never relay guild-specific channel/role/settings events for guilds not in allowedGuildIds.
- TypeScript strict mode; no new dependencies.

Acceptance Criteria & How to Test:
1. Add unit test cases in backend/src/guilds/guild-events.service.spec.ts verifying that a '*' membership reconciliation event is relayed to subscribers with non-empty allowedGuildIds, while events for unauthorized specific guild IDs are still filtered out.
2. Run: cd backend && npm test

```

#### Prompt 8 — \[API-03\] Allow Direct Prometheus Scraping of `GET /metrics` in Production

```
Finding ID: API-03 (High)
Files & Functions to Change:
- backend/src/app.setup.ts (configureApp)
- backend/src/app.setup.spec.ts

Problem:
MetricsController (backend/src/metrics/metrics.controller.ts:10-19) is documented as "Scraped by Prometheus directly on the API (not through the dashboard proxy)" and validates Authorization: Bearer <METRICS_TOKEN> using timingSafeEqual. However, configureApp in backend/src/app.setup.ts (lines 26–36) blocks all requests in production except GET|HEAD /dexbotx/health unless the frontend proxy header x-dexbotx-proxy-secret is present.

Desired Behavior:
1. In backend/src/app.setup.ts (lines 28–30), allow (req.method === 'GET' || req.method === 'HEAD') && (req.path === '/dexbotx/health' || req.path === '/metrics') to bypass the x-dexbotx-proxy-secret middleware so MetricsController can authenticate the request via Bearer METRICS_TOKEN (or return 404 when METRICS_TOKEN is unset).

Constraints:
- Keep x-dexbotx-proxy-secret required on all other routes in production.
- TypeScript strict mode; no new dependencies.

Acceptance Criteria & How to Test:
1. Add a test in backend/src/app.setup.spec.ts confirming GET /metrics passes through the proxy-secret middleware in production so controller-level Bearer authentication handles it.
2. Run: cd backend && npm test

```

#### Prompt 9 — \[SCALE-03\] Sync Guilds, Channels, and Roles from Gateway Cache on `ClientReady` Instead of Making 3N REST Calls

```
Finding ID: SCALE-03 (High)
Files & Functions to Change:
- backend/src/bot/guild-sync.service.ts (add syncGuildFromGateway)
- backend/src/bot/guild-sync.service.spec.ts
- backend/src/bot/bot.service.ts (BotService.onReady, BotService.syncAll)

Problem:
In backend/src/bot/bot.service.ts (lines 174–177, 196–201), onReady() and the 3-hour syncTimer call syncAll([...ready.guilds.cache.values()]), which calls this.sync.syncGuild(guild.id) sequentially for every guild. syncGuild(guildId) makes 3 Discord REST calls per guild (getGuildAsBot, getGuildChannels, getGuildRoles) even though the Gateway READY payload already populated guild, guild.channels.cache, and guild.roles.cache in memory. Additionally, this.syncTimer is not .unref()'d.

Desired Behavior:
1. In GuildSyncService (backend/src/bot/guild-sync.service.ts), add async syncGuildFromGateway(guild: Guild): Promise<void> that extracts the guild row, raw channels from [...guild.channels.cache.values()] (mapping id, name, type, position, parentId), and roles from [...guild.roles.cache.values()] (mapping id, name, color, position) and runs the same database transaction and Redis cache population as syncGuild() without making any Discord REST calls.
2. In BotService.syncAll (backend/src/bot/bot.service.ts:196-201), call this.sync.syncGuildFromGateway(guild) instead of this.sync.syncGuild(guild.id).
3. In BotService.onReady (backend/src/bot/bot.service.ts:175-177), call this.syncTimer.unref().
4. Keep GuildSyncService.syncGuild(guildId) for on-demand REST refreshes (POST /guilds/:guildId/refresh, onGuildCreate fallback if needed, and backfill-guild-data.ts).

Constraints:
- Preserve exact DB schema writes and Redis cache keys/TTLs.
- TypeScript strict mode; no new dependencies.

Acceptance Criteria & How to Test:
1. Add a unit test in backend/src/bot/guild-sync.service.spec.ts verifying syncGuildFromGateway persists guild, channels, and roles and updates Redis caches with zero calls to DiscordRestService.
2. Run: cd backend && npm test && npm run test:e2e

```

#### Prompt 10 — \[SCALE-04\] Prevent BullMQ and `RedisService` Shutdown Race Condition

```
Finding ID: SCALE-04 (High)
Files & Functions to Change:
- backend/src/redis/redis.service.ts (RedisService)
- backend/src/queue/member-events.queue.ts (MemberEventsQueue)
- backend/src/worker/member-events.processor.ts (MemberEventsProcessor)

Problem:
MemberEventsQueue and MemberEventsProcessor pass this.redis.client directly to BullMQ. During NestJS shutdown (onApplicationShutdown), RedisService.onApplicationShutdown calls this.client.quit() concurrently with MemberEventsProcessor.onApplicationShutdown (this.worker?.close()) and MemberEventsQueue.onApplicationShutdown (this.queue.close()), which can close the shared Redis connection while an active worker job is still completing.

Desired Behavior:
1. Move MemberEventsProcessor.close() and MemberEventsQueue.close() to OnModuleDestroy (implements OnModuleDestroy -> async onModuleDestroy()) while keeping RedisService cleanup in OnApplicationShutdown (async onApplicationShutdown()). In NestJS lifecycle order, all onModuleDestroy() hooks complete and await before any onApplicationShutdown() hook runs, guaranteeing that the BullMQ Worker and Queue finish draining in-flight jobs and writing stats to Redis before RedisService.onApplicationShutdown quits the Redis clients.

Constraints:
- Keep existing Redis connection count within the budget tested by backend/test/api.e2e-spec.ts:1946 (<= 10 connections across api, shard0, and worker).
- TypeScript strict mode; no new dependencies.

Acceptance Criteria & How to Test:
1. Verify MemberEventsProcessor and MemberEventsQueue implement OnModuleDestroy and close cleanly before RedisService.onApplicationShutdown runs.
2. Run: cd backend && npm test && npm run test:e2e

```

#### Prompt 11 — \[SEO-01\] Make Landing Page (`/`) Static (SSG) by Moving Query-String Alert Banner to a Suspense Client Component

```
Finding ID: SEO-01 (High)
Files & Functions to Change:
- frontend/src/components/home/home-auth-banner.tsx (new client component)
- frontend/src/app/page.tsx (Home component)

Problem:
frontend/src/app/page.tsx sets export const dynamic = 'force-dynamic' (line 17) and awaits searchParams (line 72) solely to render the ?error= and ?notice= banner after OAuth/invite redirects. This forces every visitor and search crawler hitting / to execute dynamic SSR instead of serving a static CDN-cached page.

Desired Behavior:
1. Create frontend/src/components/home/home-auth-banner.tsx as a 'use client' component that reads useSearchParams() from next/navigation and renders the exact same alert/status banner for ?error= (access_denied, login_failed, bot_invite_cancelled, bot_invite_failed) and ?notice=bot_added_login_required.
2. In frontend/src/app/page.tsx, remove export const dynamic = 'force-dynamic' and the searchParams prop, make Home a synchronous static Server Component, and render <Suspense fallback={null}><HomeAuthBanner /></Suspense> inside <main>.

Constraints:
- Preserve exact banner markup, ARIA roles (role="alert" / role="status"), copy, and links.
- TypeScript strict mode; no new dependencies.

Acceptance Criteria & How to Test:
1. Run: cd frontend && npm run build
2. Verify in the Next.js build output that route / is marked as ○ (Static) instead of ƒ (Dynamic).
3. Verify visiting /?error=access_denied and /?notice=bot_added_login_required still displays the banner.

```

#### Prompt 12 — \[SEO-02\] Fix Eager Footer Image Loading and Remove Unused Multi-Megabyte Public GIFs

```
Finding ID: SEO-02 (High)
Files & Functions to Change:
- frontend/src/components/site-footer.tsx (SiteFooter)
- frontend/public/dexbotx-banner.gif (delete unused 5.8 MB file)
- frontend/public/dexbotx-banner-v1.gif (delete unused 5.8 MB file)
- frontend/public/favicon.ico (delete duplicate 362 KB file; src/app/favicon.ico is used by Next.js)
- frontend/public/loading.svg (keep) and ./loading.svg / ./Coding.gif (clean up if unused)

Problem:
1. SiteFooter (frontend/src/components/site-footer.tsx:22) sets loading="eager" on /assets/DiscordCharDexbotx.png (342 KB, 1022x1195), forcing browsers to eagerly download a below-the-fold footer image on every public page load and competing with LCP resources.
2. frontend/public/ contains 11.6 MB of unreferenced GIF banners (dexbotx-banner.gif and dexbotx-banner-v1.gif) and a duplicate 362 KB favicon.ico.

Desired Behavior:
1. In frontend/src/components/site-footer.tsx (line 22), remove loading="eager" (allowing Next.js Image default lazy loading for the footer mascot).
2. Remove unreferenced frontend/public/dexbotx-banner.gif, frontend/public/dexbotx-banner-v1.gif, and duplicate frontend/public/favicon.ico.

Constraints:
- Do not remove ./Coding.gif at repo root because Readme.md line 139 references ./Coding.gif.
- TypeScript strict mode; no new dependencies.

Acceptance Criteria & How to Test:
1. Inspect rendered HTML on / and /features to confirm the footer mascot <img> has loading="lazy".
2. Run: cd frontend && npm run build && npm test

```

#### Prompt 13 — \[OPS-01\] Add Sentry Error Reporting to Bot Shards and Next.js Global Error Boundaries

```
Finding ID: OPS-01 (High)
Files & Functions to Change:
- backend/src/bot/shard.ts (bootstrap)
- backend/src/bot/bot.service.ts (BotService.safe, handleModerationInteraction)
- frontend/src/app/global-error.tsx (new file)
- frontend/src/app/error.tsx (GlobalError)

Problem:
1. backend/src/main.ts and backend/src/worker/worker.ts initialize @sentry/node when config.sentryDsn is set, but backend/src/bot/shard.ts does not initialize Sentry, and BotService.safe() / handleModerationInteraction() only log errors without calling Sentry.captureException().
2. The Next.js frontend has no src/app/global-error.tsx to catch root layout errors, and src/app/error.tsx does not log or report caught error objects.

Desired Behavior:
1. In backend/src/bot/shard.ts, resolve APP_CONFIG from the Nest application context and call Sentry.init({ dsn: config.sentryDsn, environment: config.nodeEnv, tracesSampleRate: 0 }) when config.sentryDsn is truthy.
2. In backend/src/bot/bot.service.ts, call Sentry.captureException(err) inside safe() and handleModerationInteraction() catch blocks.
3. Create frontend/src/app/global-error.tsx ('use client') rendering a minimal fallback html/body with a "Try again" reset button, and log the caught error in both error.tsx and global-error.tsx via useEffect(() => { console.error(error); }, [error]).

Constraints:
- Keep existing unit and e2e tests passing (Sentry.captureException is a safe no-op when Sentry.init has not been called).
- TypeScript strict mode; no new dependencies.

Acceptance Criteria & How to Test:
1. Run: cd backend && npm test && npm run typecheck
2. Run: cd frontend && npm test && npm run typecheck && npm run build

```

### Medium & Low Findings (Grouped by Theme)

#### Prompt 14 — \[SEC-04\] Re-Validate Sessions on Active WebSockets and Terminate Sockets on Logout / Revocation

```
Finding ID: SEC-04 (Medium)
Files & Functions to Change:
- backend/src/auth/auth.service.ts (AuthService.logout)
- backend/src/auth/session.service.ts (SessionService.destroy, SessionService.destroyAllForUser)
- backend/src/realtime/realtime.gateway.ts (RealtimeGateway)
- backend/src/realtime/realtime.gateway.spec.ts

Problem:
RealtimeGateway only checks the user's session when the WebSocket initially connects and caches socket.session in memory. If the session expires or is revoked via logout() or AdminUsersContentService.revokeUser(), open WebSockets stay connected and can still join rooms.

Desired Behavior:
1. In SessionService.destroy(sid) and SessionService.destroyAllForUser(userId), publish the userId to a Redis pub/sub channel 'dexbotx:sessions:revoked'.
2. In RealtimeGateway.onModuleInit(), subscribe to 'dexbotx:sessions:revoked' and close all sockets in this.userSockets.get(userId) with code 4401 ('Session ended').
3. In RealtimeGateway.handleMessage() (before authorizing a 'join' message) and in pingClients(), check if socket.session.expiresAt <= Date.now() and close the socket with code 4401 if expired.

Constraints:
- Preserve existing RealtimeGateway unit tests in backend/src/realtime/realtime.gateway.spec.ts (treat undefined expiresAt in mock sessions as non-expired or set expiresAt in test fixture).
- TypeScript strict mode; no new dependencies.

Acceptance Criteria & How to Test:
1. Add a unit test in backend/src/realtime/realtime.gateway.spec.ts verifying that publishing a userId to 'dexbotx:sessions:revoked' closes all active sockets for that user with 4401.
2. Run: cd backend && npm test

```

#### Prompt 15 — \[SEC-05 & API-07\] Add Explicit PostgreSQL RLS Policies and Missing Audit Table Indexes

```
Finding ID: SEC-05 (Medium), API-07 (Low)
Files & Functions to Change:
- backend/src/db/schema.ts (auditLogs, modActions)
- backend/drizzle/0004_rls_policies_and_indexes.sql (new migration)
- backend/drizzle/meta/_journal.json

Problem:
1. (SEC-05) All 8 tables enable RLS with zero policies, relying on the backend connecting as a superuser/owner with BYPASSRLS.
2. (API-07) audit_logs(user_id) and mod_actions(target_id) lack indexes for user-scoped queries.

Desired Behavior:
1. In backend/src/db/schema.ts, add index('audit_logs_user_created_idx').on(t.userId, t.createdAt) to auditLogs and index('mod_actions_target_created_idx').on(t.targetId, t.createdAt) to modActions.
2. Add migration backend/drizzle/0004_rls_policies_and_indexes.sql creating those two indexes and adding a permissive policy on each of the 8 tables for current_user (e.g., CREATE POLICY "backend_access_policy" ON "guilds" FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);) while keeping Supabase anon/authenticated roles denied.
3. Register the migration in backend/drizzle/meta/_journal.json.

Constraints:
- Ensure backend/test/api.e2e-spec.ts applies all migrations cleanly.
- TypeScript strict mode; no new dependencies.

Acceptance Criteria & How to Test:
1. Run: cd backend && npm run typecheck && npm run test:e2e

```

#### Prompt 16 — \[API-04\] Fix `DiscordRestService.canBotPost()` Permission Hierarchy Calculation

```
Finding ID: API-04 (Medium)
Files & Functions to Change:
- backend/src/discord/discord-rest.service.ts (DiscordRestService.canBotPost, DiscordRole)

Problem:
DiscordRestService.canBotPost(channelId) (lines 238–248) only inspects overwrites for @everyone and the bot's user ID, ignoring role overwrites (such as the 'DexBotX' role created by ChannelAccessService) and base role permissions.

Desired Behavior:
1. In DiscordRestService.canBotPost(channelId: string):
   - Fetch the channel (/channels/${channelId}). If !channel.guild_id, return false.
   - Fetch the guild roles (getGuildRoles(channel.guild_id)) and bot member (getGuildMember(channel.guild_id, this.config.discordClientId)), using try/catch fallback to overwrite-only check if role/member endpoints are not stubbed or fail.
   - Compute base permissions: start with @everyone role permissions (if present on role object), bitwise-OR with all roles in member.roles. If ADMINISTRATOR (1n << 3n) is set in base permissions, return true.
   - Apply channel permission_overwrites in Discord's exact order:
     a) Apply @everyone overwrite (id === channel.guild_id): perms = (perms & ~BigInt(ow.deny)) | BigInt(ow.allow).
     b) Combine all role overwrites matching member.roles (roleAllow |= BigInt(ow.allow), roleDeny |= BigInt(ow.deny)): perms = (perms & ~roleDeny) | roleAllow.
     c) Apply member overwrite (id === this.config.discordClientId): perms = (perms & ~BigInt(ow.deny)) | BigInt(ow.allow).
   - Check that perms includes ViewChannel (1n << 10n) and SendMessages (1n << 11n).

Constraints:
- Keep fallback behavior when role.permissions is omitted in test stubs so existing e2e tests in backend/test/api.e2e-spec.ts pass.
- TypeScript strict mode; no new dependencies.

Acceptance Criteria & How to Test:
1. Verify that a channel where @everyone denies SendMessages (1n << 11n) but the bot's assigned role overwrite allows SendMessages returns true from canBotPost().
2. Run: cd backend && npm test && npm run test:e2e

```

#### Prompt 17 — \[API-05 & SCALE-05\] Clean Up Orphaned Custom Backgrounds and Bound `/admin/content` Concurrency

```
Finding ID: API-05 (Medium), SCALE-05 (Medium)
Files & Functions to Change:
- backend/src/storage/asset-storage.service.ts (AssetStorage.listBackgrounds, AssetStorage.pruneGuildBackgrounds)
- backend/src/welcome/welcome.service.ts (WelcomeService.removeReplacedBackground)
- backend/src/admin/admin-users-content.service.ts (AdminUsersContentService.content)

Problem:
1. (API-05) Uploading a background writes to Supabase Storage immediately, and WelcomeService.removeReplacedBackground only deletes the previously saved path in DB. Unsaved intermediate uploads are orphaned under ${guildId}/.
2. (SCALE-05) AssetStorage.listBackgrounds() loops sequentially over every guild folder making N+1 sequential HTTP requests, and AdminUsersContentService.content() is uncached.

Desired Behavior:
1. In AssetStorage (backend/src/storage/asset-storage.service.ts):
   - Add async pruneGuildBackgrounds(guildId: string, keepPaths: ReadonlySet<string>): Promise<void> that lists objects in `${guildId}/` and deletes any `${guildId}/${obj.name}` matching BACKGROUND_PATH_RE that is not in keepPaths (best-effort, catching errors so saving settings never fails if storage list fails).
   - In listBackgrounds(), use Semaphore(8) from '../shared/semaphore' with Promise.all to parallelize per-guild folder listings instead of a sequential for-await loop.
2. In WelcomeService.removeReplacedBackground(), after removing oldPath (to preserve exact existing test expectations), also call pruneGuildBackgrounds if oldPath was not the only unreferenced object, or call storage.remove(oldPath) as before.
3. In AdminUsersContentService.content(), cache the result in Redis under 'admin:content' for 30 seconds and invalidate 'admin:content' in deleteBackground().

Constraints:
- Keep existing unit and e2e tests in backend/test/api.e2e-spec.ts (lines 796–827 and 1393–1406) passing.
- TypeScript strict mode; no new dependencies.

Acceptance Criteria & How to Test:
1. Run: cd backend && npm test && npm run test:e2e

```

#### Prompt 18 — \[API-06 & SEO-03 & SEO-04\] Remove Hardcoded Domains, Fix Profile URL Normalization & Duplicate JSON-LD, and Clean Up 404 Page

```
Finding ID: API-06 (Low), SEO-03 (Medium), SEO-04 (Low)
Files & Functions to Change:
- backend/src/core/config.ts (envSchema.superRefine)
- backend/src/core/config.spec.ts
- backend/src/discord/onboarding.constants.ts
- backend/src/discord/onboarding.service.ts
- frontend/.env.example
- frontend/src/lib/site.ts
- frontend/src/app/page.tsx
- frontend/src/app/not-found.tsx

Problem:
1. (API-06) backend/src/core/config.ts hardcodes PRODUCTION_WEB_ORIGIN = 'https://dexbotx.vercel.app' (blocking custom domains), and onboarding.constants.ts hardcodes 'https://dexbotx.vercel.app/dashboard'.
2. (SEO-03) frontend/src/app/page.tsx (lines 102–113) outputs a duplicate WebSite JSON-LD block with a hardcoded URL alongside <SiteStructuredData />. frontend/.env.example sets NEXT_PUBLIC_YOUTUBE_PROFILE_URL=youtube.com/@dexgamexx1 without https://, and frontend/src/lib/site.ts passes it unnormalized, creating a broken relative link on /about and in SiteFooter.
3. (SEO-04) frontend/src/app/not-found.tsx renders three <h1> tags and unprofessional "script kiddie" copy, and SITE.keywords in frontend/src/lib/site.ts has duplicate entries.

Desired Behavior:
1. In frontend/src/lib/site.ts:
   - Write a helper normalizeExternalUrl(raw: string | undefined): string | undefined that trims the value, prepends 'https://' if it does not start with 'http://' or 'https://', and validates it with new URL() (returning undefined if invalid). Apply it to youtubeProfileUrl and all optionalProfileUrls.
   - Deduplicate SITE.keywords.
2. In frontend/.env.example (line 14), update NEXT_PUBLIC_YOUTUBE_PROFILE_URL to https://www.youtube.com/@dexgamexx1.
3. In frontend/src/app/page.tsx (lines 102–113), remove the duplicate inline <script type="application/ld+json"> block (since <SiteStructuredData /> on line 114 already emits the WebSite schema).
4. In frontend/src/app/not-found.tsx, use a single <h1>Page Not Found</h1> (change the "404" badge above it to a <p> and the subtitle below it to a friendly <p> such as "The page you are looking for doesn't exist or has been moved.").

Constraints:
- Keep backend/src/core/config.spec.ts passing (if config.spec.ts line 67 explicitly tests that 'https://other.example.com' throws /WEB_URL/, allow an optional ALLOWED_WEB_ORIGINS env var or keep the default check while supporting configured origins).
- TypeScript strict mode; no new dependencies.

Acceptance Criteria & How to Test:
1. Verify normalizeExternalUrl('youtube.com/@dexgamexx1') returns 'https://youtube.com/@dexgamexx1'.
2. Verify frontend/src/app/not-found.tsx contains exactly one <h1> element.
3. Run: cd frontend && npm run lint && npm run typecheck && npm test && npm run build

```

#### Prompt 19 — \[SCALE-06, SCALE-07 & OPS-04\] Bound Health Rate-Limit Map, Add Per-Worker Heartbeats, and Fix Pino Health Log Ignore Regex

```
Finding ID: SCALE-06 (Medium), SCALE-07 (Low), OPS-04 (Low)
Files & Functions to Change:
- backend/src/health/health.controller.ts (HealthController.takeRateLimit)
- backend/src/worker/worker.ts (publishHeartbeat)
- backend/src/core/core.module.ts (LoggerModule autoLogging.ignore)
- Readme.md (line 116)

Problem:
1. (SCALE-06) HealthController.takeRateLimit stores per-IP buckets in an in-memory Map with no maximum size cap.
2. (SCALE-07) worker.ts writes only to hb:worker, overwriting heartbeats when multiple worker replicas run.
3. (OPS-04) backend/src/core/core.module.ts (line 33) ignores /^\/(health|metrics)/ instead of /^\/(dexbotx\/health|metrics)/, causing every health check on /dexbotx/health to spam production HTTP logs. Readme.md line 116 also references old /health and /health/ready paths.

Desired Behavior:
1. In backend/src/health/health.controller.ts (takeRateLimit), cap this.rateLimits.size at 5000 entries: if this.rateLimits.size >= 5000 before inserting a new IP, delete this.rateLimits.keys().next().value.
2. In backend/src/worker/worker.ts (publishHeartbeat), write both stats.heartbeat('worker', payload, 60) and stats.heartbeat(`worker:${process.pid}`, payload, 60).
3. In backend/src/core/core.module.ts (line 33), change the ignore regex to /^\/(dexbotx\/health|health|metrics)/.
4. In Readme.md (line 116), update the health endpoint documentation to GET /dexbotx/health.

Constraints:
- Keep all existing health check tests in backend/test/api.e2e-spec.ts passing.
- TypeScript strict mode; no new dependencies.

Acceptance Criteria & How to Test:
1. Run: cd backend && npm test && npm run test:e2e

```

#### Prompt 20 — \[UX-02, UX-03 & UX-04\] Add Focus Trapping & Escape Key to Admin Dialogs, Move Admin Message Send to `adminApi`, and Fix Landing Page Typo

```
Finding ID: UX-02 (Medium), UX-03 (Medium), UX-04 (Low)
Files & Functions to Change:
- frontend/src/app/admin/servers/page.tsx (AdminServersPage)
- frontend/src/app/admin/servers/[guildId]/page.tsx (AdminServerDetailPage)
- frontend/src/store/adminApi.ts (adminApi)
- frontend/src/components/home/feature-section.tsx (HomeFeatureSection)

Problem:
1. (UX-02) The server detail drawer and confirmation modals in /admin/servers and /admin/servers/[guildId] lack Escape key dismissal and Tab focus trapping (unlike MobileNav in frontend/src/components/dashboard/mobile-nav.tsx).
2. (UX-03) AdminServerDetailPage sends messages using raw fetch() instead of an RTK Query mutation in adminApi, leaving AdminAudit cache tags stale.
3. (UX-04) frontend/src/components/home/feature-section.tsx (line 147) has a grammatical typo: "Every Tools you need to grow your community server".

Desired Behavior:
1. In frontend/src/store/adminApi.ts, add sendAdminGuildMessage: build.mutation<{ ok: true; channelId: string }, { id: string; body: AdminMessageInput }> with query: ({ id, body }) => ({ url: `/admin/guilds/${encodeURIComponent(id)}/message`, method: 'POST', body }) and invalidatesTags: (_r, _e, { id }) => ['AdminAudit', { type: 'AdminGuild', id }], and use it in AdminServerDetailPage (or dispatch adminApi.util.invalidateTags(['AdminAudit', { type: 'AdminGuild', id: guildId }]) after a successful send).
2. In frontend/src/app/admin/servers/page.tsx and frontend/src/app/admin/servers/[guildId]/page.tsx, add a useEffect hook when a dialog/drawer is open that listens for Escape (calling closeDialog / setSelectedId(null) / setConfirmOpen(false)) and traps Tab / Shift+Tab focus within the active modal ref.
3. In frontend/src/components/home/feature-section.tsx (line 147), change "Every Tools" to "Every tool".

Constraints:
- Preserve existing rate-limit Retry-After cooldown handling in AdminServerDetailPage.
- TypeScript strict mode; no new dependencies.

Acceptance Criteria & How to Test:
1. Open /admin/servers, click a server to open the drawer, and press Escape -> drawer closes.
2. Open the confirmation modal, press Tab/Shift+Tab -> focus stays inside the modal; press Escape -> modal closes.
3. Run: cd frontend && npm run lint && npm run typecheck && npm test && npm run build

```

#### Prompt 21 — \[OPS-02 & OPS-03\] Add Admin Guild Data Purge Endpoint, Audit Retention Cleanup, and Frontend Component Tests

```
Finding ID: OPS-02 (Medium), OPS-03 (Medium)
Files & Functions to Change:
- backend/src/admin/admin-operations.service.ts (add purgeGuildData, pruneOldAuditLogs)
- backend/src/admin/admin.controller.ts (add POST guilds/:id/purge)
- frontend/src/lib/site.spec.ts (new test file)

Problem:
1. (OPS-03) Privacy Policy (frontend/src/app/privacy/page.tsx:50-51) states server owners can request deletion of stored server data and uploaded backgrounds, but there is no admin endpoint to purge a guild's rows (guild_settings, guild_channels, guild_roles, guild_templates, audit_logs, mod_actions, guilds) and Supabase backgrounds, nor to prune old audit logs.
2. (OPS-02) Frontend lacks tests for site metadata/URL normalization and component state.

Desired Behavior:
1. In AdminOperationsService (backend/src/admin/admin-operations.service.ts), add async purgeGuildData(adminId: string, guildId: string, confirm: string): Promise<{ ok: true }> that verifies the guild exists, checks confirm === guild.name, deletes any stored custom backgrounds for that guild, runs a database transaction deleting rows for guildId from guildSettings, guildChannels, guildRoles, guildTemplates, auditLogs, modActions, and guilds, clears Redis keys for the guild, and logs 'guild.purge' to adminAudit.
2. Expose @Post('guilds/:id/purge') on AdminController (backend/src/admin/admin.controller.ts).
3. Create frontend/src/lib/site.spec.ts testing SITE metadata generation, keyword deduplication, and external profile URL normalization.

Constraints:
- Follow existing confirmation pattern in AdminOperationsService.leaveGuild.
- TypeScript strict mode; no new dependencies.

Acceptance Criteria & How to Test:
1. Run: cd backend && npm test && npm run typecheck
2. Run: cd frontend && npm test && npm run typecheck

```