---
name: dexbotx-project-guide
description: Complete architecture, folder structure, and workflow reference for DexBotX (Discord bot + Next.js frontend + NestJS backend). Read this first before adding features, fixing bugs, or changing structure.
---

# DexBotX Project Guide

## ⚠️ MANDATORY MAINTENANCE RULE
This file must always match the current state of the project.
- Before starting any task, read this file fully instead of re-analyzing the whole repo.
- After ANY change that adds, removes, renames, or moves a feature, module, route, command, event, database model, env variable, dependency, or folder, you MUST update this file in the same task.
- Update the relevant sections AND the "Last updated" line and "Changelog" at the bottom.
- A task is NOT complete until this file reflects the change.

## 1. Project Overview

DexBotX is an open-source Discord community bot and web dashboard. It targets Discord server owners and authorized community managers who need welcome/goodbye messaging, moderation commands, guild synchronization, and server configuration.

Current implemented or exposed capabilities:
- Personalized welcome and goodbye cards/messages, including text, embeds, presets, placeholders, channel selection, and optional custom backgrounds.
- Automatic assignment of one safe role to new members after they are ready, with 30-second bounded planning, one-second guild pacing, optional announcements, and recent activity/diagnostics.
- Guild onboarding/invitation flow and automatic synchronization of guild metadata, channels, roles, and membership state.
- Discord slash moderation commands: `/kick`, `/ban`, `/unban`, `/timeout`, and `/untimeout`, with permission guards, DM notices, Redis rate limiting, metrics, and audit logging.
- Discord OAuth dashboard login and guild-level access control.
- A public Next.js site, dashboard, and admin console.
- REST, Server-Sent Events, and native WebSockets for dashboard/API communication and live guild updates.
- BullMQ background processing for member welcome/goodbye jobs.
- Health, metrics, Redis-backed caching/rate limits/pub-sub, Sentry, and optional Supabase Storage.

Planned or not implemented in the current code:
- Automatic moderation (dashboard marks it “coming soon”; slash moderation commands are implemented).
- AI auto chat, anti-spam automation, and social notifications are described in public copy or previews but do not have a complete backend/configuration implementation found in this repository.
- Economy and 24/7 music are explicitly not available.
- Self-service editing of the bot profile image, banner, or description is explicitly not available.

## 2. Tech Stack

### Runtime and shared tooling
- TypeScript and Node.js 26.x; npm.
- Three backend processes: NestJS API, Discord shard/manager bot, and BullMQ worker.
- Windows/local and Docker/Render deployment paths.

### Backend
- NestJS 11.1, Express 11-era platform integration, Nest WebSockets.
- Discord.js 14.27.
- PostgreSQL via `postgres` 3.4.9 and Drizzle ORM 0.45.4/Drizzle Kit 0.31.11.
- Redis via `ioredis` 5.8.0.
- BullMQ 6.3.15.
- Zod 4.6.7 for environment and message validation.
- Pino/nestjs-pino for logs, Helmet/compression/cookie-parser, Prometheus `prom-client`, Sentry 11.8.
- `@napi-rs/canvas` for card rendering and Multer-style upload interception for image uploads.
- Jest 29, ts-jest, Supertest, ESLint 10, TypeScript 5.9.

### Frontend
- Next.js 16.4.6 App Router, React 19.1, React DOM 19.1.
- `frontend/next.config.mjs` enables the Next.js `experimental.agentUpgrade: 'security'` policy to surface security-update guidance to coding agents.
- Redux Toolkit 2.9 and RTK Query 2.9.
- Tailwind CSS 4.1/PostCSS 8.5.
- Radix UI Switch/Slot, CVA, clsx, tailwind-merge, next-themes, Sonner, Lucide React 1.57, Geist.
- Zod 4.6.7.
- Vitest 5, Testing Library React 16.3, jsdom 26.1, Next bundle analyzer, ESLint 10, TypeScript 5.9.

### Database, cache, storage, and deployment
- PostgreSQL is the source of truth for guilds/settings/channels/roles/templates/audit/moderation data.
- Redis stores encrypted sessions, caches, rate-limit counters, pub/sub channels, feature flags/stat counters, and BullMQ jobs.
- Supabase Storage is optional for private custom card backgrounds.
- Render is represented by `backend/render.yaml`; Dockerfiles exist for both packages.
- Frontend production output is Next standalone; frontend is designed for Vercel and container hosts.
- GitHub Actions provide backend/frontend CI, CodeQL, npm audit, Gitleaks, Semgrep, and secret checks.

## 3. High-Level Architecture

```mermaid
flowchart LR
  U[Discord user / server] <-->|Gateway events + slash interactions| BOT[Discord bot shards]
  BOT -->|guild sync / REST writes| DB[(PostgreSQL)]
  BOT -->|welcome/goodbye job| REDIS[(Redis / BullMQ)]
  REDIS --> WORKER[Queue worker]
  WORKER -->|read settings / write Discord| DB
  WORKER -->|Discord REST create message| U
  BROWSER[Browser / dashboard] -->|same-origin /api/*| FRONTEND[Next.js frontend]
  FRONTEND -->|server-side proxy| API[NestJS REST API]
  API <-->|Drizzle| DB
  API <-->|sessions/cache/pubsub/rate limits| REDIS
  API <-->|native WebSocket / SSE| BROWSER
  API -->|optional private background storage| SUPABASE[(Supabase Storage)]
```

The bot, API, and worker are separate long-lived processes sharing PostgreSQL and Redis. The frontend never calls the backend directly from browser code; it uses `/api/*`, which is proxied by `frontend/src/app/api/[[...path]]/route.ts`. The proxy also adds the backend shared secret in production and forwards the client IP.

## 4. Current Folder Structure

```text
.
├── .agents/
│   └── skills/
│       └── frontend-design/
│           ├── SKILL.md              # Anthropic frontend-design visual guidance
│           └── LICENSE.txt           # Skill license
├── .claude/
│   └── skills/
│       └── frontend-design/          # Junction to .agents/skills/frontend-design
├── Readme.md                         # Public project overview, architecture, setup, and maintenance links
├── Coding.gif, loading.svg           # Root documentation/site assets
├── DexbotxArch.jpg                   # Architecture image
├── dexbotxrequiredfixcopilot.md      # Repository task notes; not runtime source
├── gitleaks.toml                     # Gitleaks configuration
├── skills-lock.json                  # Installed skills registry and source commit/hash
├── backend/
│   ├── package.json                  # Backend dependencies and process/build/test scripts
│   ├── package-lock.json             # Locked backend dependencies
│   ├── Dockerfile                    # API/bot/worker/migrate container image
│   ├── render.yaml                   # Render API, bot, and worker deployment configuration
│   ├── .env.example                  # Backend environment template
│   ├── drizzle.config.ts             # Drizzle schema/migration configuration
│   ├── drizzle/                      # SQL migrations and Drizzle metadata
│   │   ├── 0005_auto_roles.sql       # Auto-role settings, role metadata, and event table
│   │   ├── 0006_auto_roles_defaults.sql # Align SQL default with current Auto Roles defaults
│   │   ├── 0007_auto_roles_30_seconds.sql # 30-second pacing, activity delay, and outcome codes
│   │   └── meta/                     # Drizzle migration journal and schema snapshots
│   ├── scripts/register-commands.ts  # Discord slash-command registration
│   ├── test/api.e2e-spec.ts          # Backend API end-to-end suite
│   └── src/
│       ├── app.module.ts             # Root Nest module and global filter/guard/interceptor
│       ├── app.setup.ts              # Helmet, CORS, proxy, cookies, parsers, WebSocket adapter
│       ├── main.ts                   # Nest HTTP API entry point
│       ├── admin/                    # Admin API, guard, operations, audit, user/content, metrics
│       ├── assets/                   # Guild background upload API
│       ├── auth/                     # Discord OAuth, session, cookies
│       ├── bot/                      # Discord client, shard manager, guild sync, moderation
│       │   ├── commands/             # Slash command definitions and moderation guard
│       │   └── guild-sync.service.spec.ts # Guild snapshot and reconciliation tests
│       ├── common/                   # Global guard, decorators, DTO validation, error filter
│       ├── core/                     # Config, feature flags, shared infrastructure module
│       ├── db/                       # Drizzle database service, schema, migration/backfill scripts
│       ├── discord/                  # Discord REST, channel access, onboarding
│       ├── guilds/                   # Guild API, access guard, sync events, invite
│       │   ├── auto-roles.service.ts # Auto-role settings, role safety, test, activity, diagnosis
│       │   └── auto-roles.service.spec.ts # Role classification and cache-only GET checks
│       ├── health/                   # Dependency health/readiness controller
│       ├── metrics/                  # Prometheus metrics and HTTP interceptor
│       ├── queue/                    # BullMQ member-event queue
│       ├── realtime/                 # Native WebSocket gateway and tickets
│       ├── redis/                    # Redis connection, cache, and rate limiter
│       ├── render/                   # Card/message rendering
│       ├── shared/                   # Card, crypto, permissions, presets, placeholders, auto-role helpers/tests
│       │   ├── auto-roles.ts         # Auto-role validation, timing, template, and safety helpers
│       │   ├── auto-roles.spec.ts    # Auto-role normalization and policy tests
│       │   └── job-id.ts             # Validated BullMQ custom job IDs
│       ├── storage/                  # Supabase Storage adapter
│       ├── templates/                # Public preset/template endpoints
│       ├── welcome/                  # Welcome/goodbye save, reset, preview, test
│       └── worker/                   # BullMQ consumer entry point and processor
│           └── member-events.processor.spec.ts # Auto-role worker and announcement tests
├── frontend/
│   ├── package.json                  # Frontend dependencies and scripts
│   ├── package-lock.json
│   ├── Dockerfile                    # Standalone Next.js container
│   ├── .env.example                  # Frontend environment template
│   ├── next.config.mjs               # Standalone output, CSP, proxy/build settings
│   ├── src/app/                      # Next App Router pages/routes
│   │   └── dashboard/[guildId]/auto-roles/
│   │       ├── page.tsx                 # Auto Roles dashboard editor and rich role-color picker
│   │       └── page.spec.tsx            # Auto Roles dashboard interaction and layout tests
│   ├── src/components/               # Dashboard, admin, editor, preview, SEO, UI components
│   ├── src/lib/                      # API types, schemas, SEO, realtime, cache, utilities
│   ├── src/store/                    # Redux store, RTK Query APIs, editor state
│   ├── src/assets/                   # Local images and showcase data
│   ├── public/                       # Public static assets
│   └── e2e/, test-results/           # End-to-end files and recorded test artifacts
└── .github/
    ├── workflows/backend-ci.yml      # Backend lint/type/test/e2e/build and Docker CI
    ├── workflows/frontend-ci.yml     # Frontend lint/type/test/build CI
    ├── workflows/security.yml        # CodeQL, dependency, audit, Gitleaks, Semgrep checks
    └── skills/
        ├── accessibility/SKILL.md    # WCAG 2.2 accessibility audit guidance
        ├── frontend-ui-engineering/SKILL.md # Production Next.js/React UI engineering guidance
        ├── ui-skills-root/SKILL.md   # Routing guide for ui-skills categories
        └── dexbotx-project-guide/SKILL.md # This project guide
```

## 5. Backend (NestJS) Details

### Modules and responsibilities
- `AppModule`: global imports and `RequestGuard`, `AllExceptionsFilter`, `HttpMetricsInterceptor`.
- `CoreModule`: global config/logger, PostgreSQL, Redis, rate limiter, settings cache, stats, feature flags.
- `AuthModule`: Discord OAuth and Redis-backed sessions.
- `GuildsModule`: guild listing/detail/channels/roles/refresh, SSE guild events, invite, bot-added callback.
- `WelcomeModule`: save/reset/preview/test welcome/goodbye message configuration.
- `AssetsModule`: guild background uploads.
- `TemplatesModule`: public preset endpoints.
- `AdminModule`: admin dashboard data and operations.
- `HealthModule`: database/Redis/bot/worker/Discord 429/readiness checks.
- `MetricsModule`: `/metrics` Prometheus endpoint and metric definitions.
- `RealtimeModule`: WebSocket ticket endpoint and native gateway.
- `DiscordModule`: Discord REST/channel access/onboarding services.
- `QueueModule`: BullMQ queue provider.
- `RenderModule`: card and message rendering.
- `StorageModule`: optional Supabase Storage.
- `BotModule`: bot shard service, guild sync, moderation.
- `WorkerModule`: BullMQ member-event processor.

### Discord bot lifecycle
- `backend/src/bot/manager.ts` starts `ShardingManager`; `backend/src/bot/shard.ts` creates the Nest application context and bot service in each shard process.
- `backend/src/bot/bot.service.ts` creates the Discord.js client. Intents: `Guilds` and privileged `GuildMembers`; partial: `GuildMember`.
- Registered gateway events include ready, guild create/update/delete, channel create/update/delete, role create/update/delete, member add/remove, Discord client/shard errors, disconnect/reconnect/resume.
- Ready handling sets presence, writes heartbeats, synchronizes guilds once and every three hours.
- Guild/member events publish sync state and Redis guild events; welcome/goodbye member events are sent to BullMQ.
- Slash interactions are delegated to `ModerationService`; bot behavior is not loaded from a generic dynamic command directory beyond the exported list in `bot/commands/index.ts`.
- Global/guild registration: `npm run commands:deploy` and `npm run commands:deploy -- --guild <guildId>` after compiling the registration script. The script uses Discord REST routes and `moderationCommands`.

### API endpoints

| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | `/dexbotx/health` | PostgreSQL, Redis, bot/worker, Discord 429 health/readiness | Public |
| GET | `/metrics` | Prometheus metrics; disabled unless `METRICS_TOKEN` is set | Bearer token |
| GET | `/auth/login` | Start Discord OAuth, rate-limited | Public |
| GET | `/auth/callback` | Complete Discord OAuth and set session cookie | Public |
| POST | `/auth/logout` | Destroy session and clear cookies | Public |
| GET | `/auth/me` | Current user and admin status | Session |
| GET | `/guilds` | Guilds the signed-in user can manage | Session |
| GET | `/guilds/:guildId` | Guild detail, message and Auto Roles settings/checks, image keys | Session + guild access |
| GET | `/guilds/:guildId/channels` | Guild channels | Session + guild access |
| GET | `/guilds/:guildId/roles` | Guild roles | Session + guild access |
| POST | `/guilds/:guildId/refresh` | Force guild sync; 30-second cooldown | Session + guild access |
| PUT | `/guilds/:guildId/auto-roles` | Save and validate Auto Roles settings | Session + guild access |
| POST | `/guilds/:guildId/auto-roles/test` | Send a saved test announcement, including its optional embed | Session + guild access; 3/min |
| GET | `/guilds/:guildId/auto-roles/activity` | Last 20 automatic role outcomes | Session + guild access |
| GET | `/guilds/:guildId/auto-roles/diagnose` | Current Auto Roles readiness and recent outcomes | Session + guild access |
| PUT | `/guilds/:guildId/messages/:kind` | Save welcome/goodbye config | Session + guild access |
| DELETE | `/guilds/:guildId/messages/:kind` | Reset welcome/goodbye config | Session + guild access |
| POST | `/guilds/:guildId/messages/:kind/preview` | Render PNG preview (supports ETag) | Session + guild access |
| POST | `/guilds/:guildId/messages/:kind/test` | Post a test card/message | Session + guild access |
| POST | `/guilds/:guildId/assets/background` | Upload and process 2 MB max background image | Session + guild access |
| GET | `/templates/presets` | Public message presets | Public |
| GET | `/presets` | Public alias for presets | Public |
| GET | `/invite` | Redirect to Discord bot authorization | Public |
| GET | `/bot/added` | Redirect/invite completion callback to dashboard | Public |
| GET | `/events/guilds` | SSE guild event stream | Session |
| POST | `/ws/ticket` | Create native WebSocket ticket | Session/rate-limited |
| GET | `/admin/me` | Verify admin session | Admin |
| GET | `/admin/overview` | Admin overview metrics | Admin |
| GET | `/admin/rate-limits` | Rate-limit status | Admin |
| GET | `/admin/guilds` | Paginated guild search | Admin |
| GET | `/admin/guilds/:id` | Guild admin detail | Admin |
| GET | `/admin/guilds/:id/channels-for-message` | Channels usable for admin message | Admin |
| POST | `/admin/guilds/:id/message` | Send an admin-defined guild message | Admin |
| POST | `/admin/guilds/:id/resync` | Resync guild | Admin |
| POST | `/admin/guilds/:id/disable` | Disable bot for guild | Admin |
| POST | `/admin/guilds/:id/leave` | Leave guild | Admin |
| POST | `/admin/guilds/:id/purge` | Purge guild data | Admin |
| POST | `/admin/audit/prune` | Prune old audit logs | Admin |
| GET | `/admin/failures` | Queue/failed-post view | Admin |
| POST | `/admin/failures/clear` | Clear failure records | Admin |
| POST | `/admin/failures/:jobId/retry` | Retry failed BullMQ job | Admin |
| GET | `/admin/audit` | Admin audit events | Admin |
| GET | `/admin/users` | Active/recent users | Admin |
| POST | `/admin/users/:id/revoke` | Revoke user sessions | Admin |
| GET | `/admin/content` | Admin content/background listing | Admin |
| POST | `/admin/content/background` | Delete uploaded background | Admin |
| GET | `/admin/flags` | Feature flags | Admin |
| PUT | `/admin/flags` | Update feature flags | Admin |
| GET | `/flags` | Public feature flags | Public |

There may be direct routes in `bot-added.controller.ts` for `/bot/added`; confirm exact callback behavior in that file.

### Database

Drizzle ORM plus PostgreSQL. All schema tables use Drizzle and are enabled for RLS where noted. All tables are under `backend/src/db/schema.ts`.

| Table | Fields | Relations |
|---|---|---|
| `guilds` | guild_id PK, name, icon, banner_hash, owner_id, member_count, bot_present, joined_at, left_at, last_synced_at, last_message_at, updated_at | Referenced by settings, channels, roles, templates |
| `guild_settings` | guild_id PK/FK, welcome JSONB, goodbye JSONB, auto_roles JSONB, updated_by, updated_at | One settings row per guild |
| `guild_channels` | guild_id, id, name, type, parent_id, position; composite PK(guild_id,id) | Guild FK |
| `guild_roles` | guild_id, id, name, color, position, permissions, managed, tags; composite PK(guild_id,id) | Guild FK |
| `guild_templates` | guild_id, id, name, config JSONB, created_at, updated_at | Guild FK |
| `audit_logs` | id, guild_id, user_id, action, created_at | No FK declared in schema |
| `admin_audit` | id, admin_id, action, target, details JSONB, created_at | No relations |
| `mod_actions` | id, guild_id, moderator_id, target_id, action, reason, duration_seconds, created_at | No relations |
| `auto_role_events` | id, guild_id, user_id, role_id, outcome, delay_seconds, created_at | No relations; purged after 14 days |

Migrations: `backend/drizzle/0000_swift_white_tiger.sql` through `0007_auto_roles_30_seconds.sql`. Generate with `npm run db:generate`; migrate built output with `npm run db:migrate`. Migration 0005 uses idempotent DDL for additive columns, the activity table/index, and its RLS policy. Migration 0007 adds actual delay reporting and the `enqueue_failed`/`skipped_pending` outcome codes; legacy delay fields are normalized when settings are read.

### Auth, validation, guards, config, and middleware
- Discord OAuth sessions are encrypted in Redis; session cookie name and settings are in `backend/src/auth/cookies.ts` and `session.service.ts`.
- `RequestGuard` loads session cookies, rejects cross-site state changes, applies Redis rate limits, and requires a session unless `@Public()`.
- `GuildAccessGuard` authorizes the signed-in user for an installed guild.
- `AdminGuard` verifies `session.userId` appears in `ADMIN_USER_IDS`.
- Zod validates environment configuration and message configs; `ZodValidationPipe` returns structured validation issues.
- `AllExceptionsFilter` returns a safe generic 500 response.
- Logging uses Pino; pretty local logs, JSON production logs, cookie/authorization redaction.
- Helmet/CORS/compression/cookie-parser and 32 KB JSON limit are configured in `app.setup.ts`.
- Production API traffic is protected by the shared proxy secret except health/metrics paths.

### Jobs, cron, real-time
- BullMQ queue name: `member-events`; producer `backend/src/bot/bot.service.ts`; consumer `backend/src/worker/member-events.processor.ts`.
- Welcome/goodbye jobs retry five times with exponential 2-second backoff. Auto-role jobs use validated hyphenated BullMQ IDs, are removed on completion, and reschedule Discord `retryAfter`/shared cooldown waits indefinitely through delayed state.
- Auto-role assignment reserves per-guild one-second slots at scheduling and execution time, and uses a token-checked assignment lock; member role IDs are cached from gateway events so the worker avoids a Discord member GET.
- Auto-role settings use a 0-30 second automatic delay (default 3); load spacing is capped at 30 seconds. Members are never assigned while pending, even for legacy settings that disabled the screening wait. Legacy delay fields normalize to the new `delaySeconds` value. Role hierarchy comparisons use Discord's snowflake tie-break for roles at equal positions.
- A missing or legacy bot-status cache is refreshed from Discord using the current guild-role snapshot before dashboard classification or member assignment.
- Auto-role announcements are Redis-batched for 20 seconds by guild/channel, support optional embeds and exact user mention allowlists, and do not roll back an assigned role on delivery failure. The worker recovers pending batches with Redis `SCAN` at startup and drains timers after closing the worker during graceful shutdown; pending batch keys expire after 30 minutes.
- Welcome/goodbye jobs older than 30 minutes are skipped; auto-role jobs are not discarded for age and re-read settings at processing time.
- Auto-role activity records include elapsed ready-to-outcome delay and machine-readable outcomes, including enqueue failures. Activity and diagnosis endpoints expose recent outcomes. Activity is purged on worker startup and then every 24 hours; guild activity rows are removed before the bot-leave state is committed.
- No conventional cron package is present. Guild sync uses 3-hour intervals and bot heartbeats use 20-second Redis writes.
- SSE route: `GET /events/guilds`.
- Native WebSocket path: `/ws`; ticket `POST /ws/ticket`, origin/ticket/session validation, per-guild rooms, 25-second ping.

## 6. Frontend (Next.js) Details

### Router and routes
App Router under `frontend/src/app/`.

| Route | Purpose |
|---|---|
| `/` | Public landing page |
| `/about` | Project/about content |
| `/features` | Feature availability list |
| `/features/[slug]` | Static feature detail generated from site feature data |
| `/commands` | Slash command documentation |
| `/faq` | FAQ |
| `/privacy` | Privacy policy |
| `/terms` | Terms |
| `/dashboard` | Signed-in guild selection |
| `/dashboard/[guildId]` | Redirect/entry to guild overview |
| `/dashboard/[guildId]/overview` | Guild overview with Welcome, Goodbye, and Auto Roles status |
| `/dashboard/[guildId]/welcome` | Welcome message/card editor |
| `/dashboard/[guildId]/goodbye` | Goodbye message/card editor |
| `/dashboard/[guildId]/auto-roles` | Auto-role settings with adaptive timing, member filters, optional announcement embed, shared native role dropdown, Discord-style preview, and recent activity |
| `/dashboard/[guildId]/social` | Social preview/coming-not-enabled UI |
| `/dashboard/[guildId]/music` | Music preview/coming-not-enabled UI |
| `/dashboard/[guildId]/[kind]` | Validates `kind` against `welcome|goodbye` and mounts editor |
| `/admin` | Admin overview |
| `/admin/guilds` | Guild management |
| `/admin/servers` | Alias-style server management route |
| `/admin/servers/[guildId]` | Server detail/admin actions |
| `/admin/audit` | Admin audit |
| `/admin/content` | Background/content management |
| `/admin/failures` | Queue failures |
| `/admin/rate-limits` | Rate-limit status |
| `/admin/settings` | Feature flags |
| `/admin/users` | Session/user management |
| `/api/[[...path]]` | Server-side catch-all backend proxy |
| `/maskable-icon`, `/opengraph-image`, `/robots.txt`, `/sitemap.xml`, `/manifest.webmanifest` | Generated metadata/assets |

### Components and state
- Layout shells: `app/layout.tsx`, dashboard/admin layouts.
- Dashboard auth: `components/dashboard/auth-gate.tsx`; admin auth: `components/admin/admin-gate.tsx`.
- Guild overview reuses the guild detail response to show enabled/disabled status for Welcome, Goodbye, and Auto Roles, with a direct Auto Roles configuration link.
- Key editor components: `message-editor.tsx`, `editor/*`, `preview/discord-preview.tsx`, `preview/use-card-preview.ts`.
- Redux store: `src/store/index.ts`; user API: `store/api.ts`; admin API: `store/adminApi.ts`; editor slice: `store/editorSlice.ts`.
- RTK Query keeps state for auth, guilds, guild details, channels, roles, presets, and mutations.
- Auto Roles save follows the Welcome/Goodbye save lifecycle: local and server validation errors are shown on their fields, and saved state/cache update only after the server confirms success.
- The Auto Roles dashboard reloads the config returned by the backend when navigating between guilds, rather than retaining the previous guild's draft. Backend normalization applies default embed title, description, and footer text when those values are missing or blank. Channel and activity fetch errors are shown explicitly rather than appearing as perpetual loading or empty activity. Saving updates the current RTK cache directly; connected guild dashboards also invalidate guild settings when an Auto Roles settings revision arrives over WebSocket.
- Auto Roles always uses backend-calculated timing; the dashboard has no delay controls and screening cannot be disabled.
- The role picker is left-aligned without a duplicate selected-role label; announcement channels use a simple select without a search field.
- `src/lib/realtime.ts` provides native WebSocket live guild event handling.
- `src/lib/site.ts`, `src/lib/seo.ts` hold public-site metadata; `src/lib/message-schema.ts` mirrors backend message validation.

### Authentication and API communication
- Browser calls use `/api/*` with `credentials: same-origin`.
- `DashboardAuthGate` calls `/api/auth/me`; 401 redirects to `/api/auth/login?returnTo=...`.
- The Next catch-all proxy forwards headers/cookies and rewrites backend redirects back to the frontend origin.
- In production it requires and sends `BACKEND_PROXY_SECRET`; browser and backend share the session cookie only through the same-origin proxy.
- Live updates use `/ws/ticket` plus native WebSocket, or the existing frontend realtime/SSE support depending on component usage.

### Styling
- Tailwind CSS 4 through `postcss.config.mjs` and `globals.css`.
- Theme support (`light|dark`) uses `next-themes`, CSS variables, and Tailwind utility classes.
- Radix UI Switch/Slot primitives, local UI wrappers, Sonner toast, Lucide icons.
- Auto Roles uses the shared native `Select` component for role selection, matching the Welcome/Goodbye channel dropdowns and leaving picker dismissal to the browser.
- Auto Roles reuses the welcome/goodbye Discord bot identity in its announcement preview and renders the configured optional embed alongside the announcement text. Recent activity is rendered below the preview in the same sidebar and remains last in the mobile flow.

## 7. Discord Bot Details

### Slash commands
Commands are guild-only and registered globally or per guild from `backend/scripts/register-commands.ts`.

| Command | Description | Options | Permission | File |
|---|---|---|---|---|
| `/kick` | Kick a member | `member` required; `reason` optional, max 400 | KickMembers | `backend/src/bot/commands/kick.ts` |
| `/ban` | Ban a user | `user` required; `delete_messages` required choices 0/86400/604800; `reason` optional, max 400 | BanMembers | `backend/src/bot/commands/ban.ts` |
| `/unban` | Unban a user ID | `user_id` required 17–20 digits; `reason` optional, max 400 | BanMembers | `backend/src/bot/commands/unban.ts` |
| `/timeout` | Timeout a member | `member` required; `duration` required choices 60/300/600/3600/86400/604800 seconds; `reason` optional | ModerateMembers | `backend/src/bot/commands/timeout.ts` |
| `/untimeout` | Remove timeout | `member` required | ModerateMembers | `backend/src/bot/commands/untimeout.ts` |

Command handling, rate limit (20 moderation actions per moderator per guild per minute), DM notices, Discord audit reasons, and `mod_actions` inserts live in `backend/src/bot/moderation.service.ts`. Shared guard logic is in `backend/src/bot/commands/moderation.guard.ts`.

### Gateway events
`backend/src/bot/bot.service.ts` handles `ClientReady`, `GuildCreate`, `GuildUpdate`, `GuildDelete`, `ChannelCreate/Update/Delete`, `GuildRoleCreate/Update/Delete`, `GuildMemberAdd/Remove`, `InteractionCreate`, and Discord shard/client error/disconnect/reconnect/resume events.

### Intents, permissions, and registration
- Privileged `Server Members Intent`/`GuildMembers` is required.
- Bot invite permission integer is `1099780443326` in both environments.
- Command registration uses `DISCORD_CLIENT_ID` and `DISCORD_BOT_TOKEN`, global by default or guild-specific with `--guild`.
- Commands are deployed only by `npm run commands:deploy`; gateway startup does not automatically register slash commands.

## 8. How the Project Works End-to-End

### User runs a slash moderation command
1. Discord sends `InteractionCreate` to a shard (`backend/src/bot/bot.service.ts`).
2. `ModerationService` defers ephemerally, fetches the moderator and target, and runs `moderationGuard`.
3. Redis limits the guild/moderator combination.
4. Discord.js executes kick/ban/unban/timeout/untimeout.
5. Success/failure is recorded in Prometheus and, on success, `modActions` is inserted.
6. The interaction receives an ephemeral confirmation or friendly error.

### Discord member joins/leaves
1. `BotService` receives `GuildMemberAdd` or `GuildMemberRemove`.
2. It loads the latest Redis settings and verifies the configured text/announcement channel belongs to the guild.
3. It enqueues `member-events` with guild/channel/user data only; settings remain in PostgreSQL/Redis.
4. `MemberEventsProcessor` re-reads settings, re-checks disabled/stale/channel mismatch, fetches assets, renders, and posts via Discord REST.
5. The worker updates `lastMessageAt`, metrics, and failure lists.

### Auto role on member join
1. `BotService` processes the welcome step before auto-role scheduling. It caches gateway role IDs, skips disabled/bot members, and stores a Redis marker for pending members; every enqueue path requires `pending === false`.
2. After readiness, the shard deduplicates by Redis key, reserves one-second per-guild pacing slots, and enqueues `autorole-<guildId>-<userId>-<joinTimestamp>` through the shared job-ID validator.
3. Any ready-state `GuildMemberUpdate` can trigger scheduling without relying on the old member's pending state; the Redis marker/recent join check and dedupe prevent missed screening transitions and duplicate jobs. The worker re-reads settings, confirms readiness, rate-paces assignments, checks cached role IDs and current role safety, then PUTs the role with audit reason `DexBotX auto role`.
4. The worker records elapsed seconds and machine-readable outcomes in `auto_role_events`; rate limits reschedule rather than discard assignments. A successful assignment optionally enters the 20-second Redis announcement batch. Save/test/activity/diagnose use `PUT /guilds/:guildId/auto-roles`, `POST /guilds/:guildId/auto-roles/test`, `GET /guilds/:guildId/auto-roles/activity`, and `GET /guilds/:guildId/auto-roles/diagnose`.
5. Channel-send status in the settings GET is read only from Redis. Saving an enabled announcement persists without waiting for Discord permission repair; that check/repair runs in the background and refreshes the five-minute Redis status cache.

### Dashboard Discord login
1. Frontend proxy forwards `/api/auth/login` to Nest.
2. `AuthService`/`AuthController` create an OAuth state cookie and redirect to Discord.
3. Discord redirects to `<WEB_URL>/api/auth/callback`.
4. Next proxy forwards callback; Nest exchanges code, stores a Redis session, sets the encrypted session cookie and `dbx_li`, then redirects to validated `returnTo`.
5. RTK Query `/auth/me` verifies the session.

### Dashboard settings change
1. `DashboardAuthGate` establishes the session and guild access.
2. `store/api.ts` uses RTK Query to call `/api/guilds/:id/messages/:kind`.
3. Next proxy forwards to Nest.
4. Zod validates the config and `GuildAccessGuard` authorizes the guild.
5. `WelcomeService` saves welcome/goodbye settings, updates Redis cache and guild event pub/sub, and writes audit data. Auto Roles saves through `AutoRolesService`, normalizes and validates role/timing/template settings, updates Redis-backed settings, and performs announcement-channel permission repair in the background. The dashboard updates its own RTK cache after save and connected guild dashboards refetch after a settings WebSocket event. The API proxy returns 504 for its 15-second backend deadline rather than leaking the timeout exception into Next.js error handling.
6. A later gateway member event reads the latest settings and the BullMQ worker re-checks them before assignment or rendering/posting.

### Guild/channel/role synchronization
1. `BotService` syncs on ready, guild/channel/role events, and every three hours.
2. `GuildSyncService` writes PostgreSQL and Redis cache/pub-sub reconciliation records.
3. Dashboard guild APIs read PostgreSQL/Redis-backed data.
4. Manual refresh is POST `/api/guilds/:guildId/refresh`.

## 9. Environment Variables

### Backend
| Name | Purpose | Required | Example format |
|---|---|---|---|
| `NODE_ENV` | Runtime mode | Optional; default development | `development|test|production` |
| `PORT` | API HTTP port | Optional; default 4000 | `4000` |
| `LOG_LEVEL` | Pino log level | Optional; default info | `info` |
| `WEB_URL` | Public dashboard origin; OAuth callback | Required | `https://example.com` |
| `ALLOWED_WEB_ORIGINS` | Additional production HTTPS origins | Optional | `https://a.example.com,https://b.example.com` |
| `WS_PUBLIC_URL` | Public native WebSocket URL | Required in production validation; default locally | `wss://api.example.com/ws` |
| `TRUST_PROXY` | Express reverse-proxy hop count | Optional; default 1 | `2` |
| `BACKEND_PROXY_SECRET` | Shared Next/Nest production proxy secret | Required in production API process | Random 32+ character string |
| `DATABASE_URL` | PostgreSQL connection URL | Required | `postgresql://user:password@host:5432/database` |
| `DATABASE_SSL` | Force PostgreSQL SSL | Optional; production default true | `true` |
| `DATABASE_POOL_MAX` | PostgreSQL pool size | Optional; default 10 | `10` |
| `REDIS_URL` | Redis connection URL | Required | `redis://host:6379` |
| `CACHE_REDIS_URL` | Optional secondary/public-status Redis | Optional | `rediss://host:6379` |
| `DISCORD_CLIENT_ID` | Discord application snowflake | Required | `17-20 digit snowflake` |
| `DISCORD_CLIENT_SECRET` | Discord OAuth secret | Required | Discord OAuth secret |
| `DISCORD_BOT_TOKEN` | Bot token | Required | Discord bot token |
| `DISCORD_SUPPORT_URL` | Public support invite | Optional | `https://discord.gg/example` |
| `ADMIN_USER_IDS` | Comma-separated Discord admin IDs | Optional; default none | `123...,456...` |
| `SHARD_COUNT` | Discord shard count | Optional; default 1 | `1` |
| `SESSION_ENCRYPTION_KEY` | 32-byte session key as 64 hex chars | Required | 64 hex characters |
| `SESSION_TTL_SECONDS` | Session lifetime | Optional; max 604800 | `604800` |
| `COOKIE_DOMAIN` | Optional shared cookie domain | Optional | `.example.com` |
| `WORKER_CONCURRENCY` | BullMQ jobs per worker | Optional; default 5 | `5` |
| `WORKER_METRICS_PORT` | Worker Prometheus HTTP port | Optional | `9464` |
| `METRICS_TOKEN` | Bearer token for API/worker metrics | Optional | Random 16+ character string |
| `SUPABASE_URL` | Optional Supabase project URL | Optional | `https://project.supabase.co` |
| `SUPABASE_SERVICE_KEY` | Optional Supabase service-role key | Optional; server-only | Supabase service-role key |
| `SUPABASE_BUCKET` | Private background bucket | Optional; default | `card-backgrounds` |
| `SENTRY_DSN` | Optional Sentry DSN | Optional | Sentry HTTPS DSN |
| `DEXBOTX_PROCESS_ROLE` | Internal process role set by API/bot/shard/worker entry points | Internal | `api|bot|worker|shard0` |
| `REDIS_PASSWORD` | Render/env example Docker placeholder | Optional; not read directly by backend config | Strong random value |
| `DEXBOTX_E2E_REDIS_URL` | Optional external Redis URL for API E2E tests; useful with Docker when `redis-server` is not installed locally | Test-only; defaults to spawning local `redis-server` | `redis://127.0.0.1:63799` |
| `ANALYZE` | Frontend-only bundle analyzer switch | Not backend | `true|false` |

`ALLOWED_WEB_ORIGINS` is accepted by `backend/src/core/config.ts` but is absent from the backend `.env.example`; keep this discrepancy in mind.

### Frontend
| Name | Purpose | Required | Example format |
|---|---|---|---|
| `BACKEND_URL` | Nest API origin used by `/api/*` proxy | Required for production build/runtime | `https://api.example.com` |
| `BACKEND_PROXY_SECRET` | Shared backend proxy secret | Required in production | Random 32+ character string |
| `NEXT_PUBLIC_WS_ORIGIN` | Browser WebSocket origin | Optional; derived from `BACKEND_URL` | `wss://api.example.com` |
| `NEXT_PUBLIC_SITE_URL` | Public canonical site origin | Optional/default in Docker; set for deployment | `https://dexbotx.vercel.app` |
| `NEXT_PUBLIC_GITHUB_URL` | Public GitHub profile | Optional | `https://github.com/example` |
| `NEXT_PUBLIC_DISCORD_SUPPORT_URL` | Public support invite | Optional | `https://discord.gg/example` |
| `NEXT_PUBLIC_YOUTUBE_PROFILE_URL` | Optional YouTube sameAs profile | Optional | `https://youtube.com/@example` |
| `NEXT_PUBLIC_X_PROFILE_URL` | Optional X sameAs profile | Optional | `https://x.com/example` |
| `NEXT_PUBLIC_TWITCH_PROFILE_URL` | Optional Twitch sameAs profile | Optional | `https://twitch.tv/example` |
| `NEXT_PUBLIC_INSTAGRAM_PROFILE_URL` | Optional Instagram sameAs profile | Optional | `https://instagram.com/example` |
| `NEXT_PUBLIC_LINKEDIN_PROFILE_URL` | Optional LinkedIn sameAs profile | Optional | `https://linkedin.com/company/example` |
| `GOOGLE_SITE_VERIFICATION` | Optional Google verification token | Optional | Verification token |
| `BING_SITE_VERIFICATION` | Optional Bing verification token | Optional | Verification token |
| `ANALYZE` | Enables bundle analyzer build | Optional | `true` |
| `VERCEL` | Platform detection read by layout code | Internal/platform-set | `1` |

Never commit real secrets or expose backend secrets through `NEXT_PUBLIC_*`.

## 10. Setup & Run

### Backend
```powershell
cd backend
Copy-Item .env.example .env
npm install
npm run build
npm run db:migrate
npm run start:dev
```

Run separate terminals:
```powershell
npm run start:dev
npm run start:bot:dev
npm run start:worker:dev
```

Production:
```powershell
npm run build
npm run db:migrate
npm run start       # API
npm run start:bot   # Discord shards
npm run start:worker
```

Commands: `lint`, `typecheck`, `test`, `test:e2e`, `build`, `db:generate`, `db:migrate`, `db:backfill-guild-data`, `commands:deploy`, `commands:deploy -- --guild <guildId>`.

### Frontend
```powershell
cd frontend
npm install
npm run dev
```

Production:
```powershell
npm run build
npm run start
```

Other commands: `lint`, `typecheck`, `test`, `analyze`.

### Full test suites with Docker Redis (PowerShell)
Run this from the repository root. The API E2E suite starts its own embedded PostgreSQL instance. For Redis, start a disposable container and pass its URL through `DEXBOTX_E2E_REDIS_URL`; this avoids requiring a local `redis-server` executable.

```powershell
$container = "dexbotx-e2e-redis-" + [guid]::NewGuid().ToString("N")
docker run --detach --rm --name $container -p 127.0.0.1:63799:6379 redis:7-alpine
if ($LASTEXITCODE -ne 0) { throw "Could not start Docker Redis" }

try {
    docker exec $container redis-cli ping # Expect PONG
    if ($LASTEXITCODE -ne 0) { throw "Docker Redis is not ready" }

    Set-Location backend
    npm test -- --runInBand
    if ($LASTEXITCODE -ne 0) { throw "Backend unit tests failed" }

    $env:DEXBOTX_E2E_REDIS_URL = "redis://127.0.0.1:63799"
    npm run test:e2e
    if ($LASTEXITCODE -ne 0) { throw "Backend E2E tests failed" }
    Remove-Item Env:DEXBOTX_E2E_REDIS_URL

    Set-Location ..\frontend
    npm test
    if ($LASTEXITCODE -ne 0) { throw "Frontend tests failed" }
}
finally {
    Remove-Item Env:DEXBOTX_E2E_REDIS_URL -ErrorAction SilentlyContinue
    docker stop $container | Out-Null
}
```

Use a fresh disposable Redis container for each E2E run. If reusing a test-only container, clear its database first with `docker exec <container-name> redis-cli FLUSHALL`; do not run `FLUSHALL` against a shared or production Redis instance. The E2E harness connects to the provided Redis URL and uses the default Redis database.

### Docker
- Backend: build context `backend`; image defaults to API; override command for bot/worker/migrate:
  `docker build -t dexbotx-backend ./backend`
- Frontend: pass build arg: `docker build --build-arg BACKEND_URL=https://api.example.com -t dexbotx-frontend ./frontend`
- `frontend` uses standalone Next output and runtime `BACKEND_URL`.
- `backend/render.yaml` runs API, bot, and worker as separate Render services and runs migrations as pre-deploy.

## 11. Conventions & Patterns

- Backend uses Nest classes, decorators, constructor dependency injection, and `@Inject(APP_CONFIG)` for config.
- Feature folders are named by domain: `auth`, `guilds`, `bot`, `welcome`, `admin`, `worker`, `realtime`.
- Use Drizzle tables in `backend/src/db/schema.ts`; use `DatabaseService.db` for queries.
- Use Zod for external/config/payload validation and Nest `ZodValidationPipe`.
- Use `@Public()` for unauthenticated routes and `@RateLimit(name, limit)` for custom endpoint limits.
- `GuildAccessGuard` protects guild routes; `AdminGuard` protects admin routes.
- Redis keys and pub/sub channels are constants/functions in nearby domain files (`guild-events.ts`, cache services).
- Auto-role safety is centralized in `backend/src/shared/auto-roles.ts`, compares equal-position roles using Discord snowflake ordering, and is applied when saving and immediately before assignment.
- BullMQ custom job IDs use `makeJobId(...)` from `backend/src/shared/job-id.ts`; Redis key names may contain colons, but custom job IDs use only letters, digits, hyphens, and underscores. Auto-role IDs are `autorole-<guildId>-<userId>-<joinTimestamp>`.
- Auto-role pacing is fully automatic and capped at 30 seconds. The dashboard exposes no delay slider; legacy saved delay fields are normalized to a 0-30 second `delaySeconds` value, defaulting to 3 seconds.
- If cached bot hierarchy is missing or predates the cached highest-role ID, `GuildSyncService.getBotStatus` refreshes it from Discord before role classification; a missing cache is not treated as a bot role at position zero.
- Backend logs use Nest `Logger`/Pino. Add context and avoid logging cookies, tokens, or authorization headers.
- Catch and sanitize Discord/user-facing errors; the global exception filter must not expose internals.
- Frontend uses `'use client'` for interactive gates and data; server components remain server-first.
- Use the existing RTK Query endpoints and Redux store rather than introducing a second data-fetching layer.
- Use Tailwind utility/CSS variable patterns and existing `components/ui` wrappers.
- Use absolute imports with `@/...` in frontend TypeScript.
- Preserve 401 handling, rate-limit toast handling, and same-origin credential behavior in API additions.
- Tests live beside backend source and in `frontend/src/**/*.spec.{ts,tsx}`. Vitest defaults to Node; UI component specs opt into jsdom with a file-level environment annotation.

## 12. How To Add Things

### Adding a bot slash command
1. Create `backend/src/bot/commands/<name>.ts` with a Discord.js `SlashCommandBuilder`.
2. Set guild context, default member permissions, and all required options.
3. Export and add it to `moderationCommands` in `backend/src/bot/commands/index.ts`.
4. Add or extend handling in `backend/src/bot/moderation.service.ts` and its action union/guard if moderation behavior is required.
5. Add metrics/audit behavior consistent with existing moderation actions.
6. Add unit tests beside the command/guard/service.
7. Deploy with `npm run commands:deploy` or `npm run commands:deploy -- --guild <guildId>`.

### Adding a bot event handler
1. Add the `discord.js` event listener in `backend/src/bot/bot.service.ts` `onApplicationBootstrap`.
2. Wrap gateway work in `safe(...)` for logging/Sentry consistency.
3. If guild state changes, add synchronization/publish logic in `backend/src/bot/guild-sync.service.ts`.
4. If work is expensive or must survive restarts, enqueue it through `backend/src/queue/member-events.queue.ts` and process in `backend/src/worker/member-events.processor.ts`.
5. Add a focused Jest spec for the sync/queue behavior.

### Adding a NestJS module/endpoint
1. Create a domain folder under `backend/src/<domain>/` with module, controller, and services.
2. Register the module in `backend/src/app.module.ts`.
3. Add endpoint decorators and `@Public()`, `@RateLimit`, and access guards appropriate to the route.
4. Use `ZodValidationPipe` for validated bodies and `APP_CONFIG` for configuration.
5. Export services through the domain module and add unit/e2e coverage.

### Adding a database model/migration
1. Add/export the Drizzle table and relations in `backend/src/db/schema.ts`.
2. Run `npm run db:generate` from `backend/` and review generated SQL under `backend/drizzle/`.
3. Use RLS and appropriate indexes consistent with existing tables.
4. Run `npm run db:migrate` against a test database before deployment.
5. Update this guide’s database table list and changelog.

### Adding a frontend page/component
1. Add an App Router page under `frontend/src/app/.../page.tsx`; add layout/loading/error files where needed.
2. For data-backed UI, add RTK Query endpoints in `frontend/src/store/api.ts` or `adminApi.ts`.
3. Place reusable UI in `frontend/src/components/<domain>/` and schemas/helpers in `frontend/src/lib/`.
4. Use existing auth gates/layouts and same-origin `/api/*` calls.
5. Add Vitest specs and run the frontend lint/type/test/build commands.

### Adding an environment variable
1. Add it to `backend/src/core/config.ts` Zod schema and `AppConfig` mapping for backend variables.
2. Add a safe placeholder/required comment to `backend/.env.example` and update backend README/render setup if deploy behavior changes.
3. For frontend variables, read it in `next.config.mjs`, proxy route, or relevant server/browser module; add it to `frontend/.env.example`.
4. Never expose backend secrets through `NEXT_PUBLIC_*`.
5. Update this guide’s environment section and changelog.

## 13. Known Issues / TODOs / Technical Debt
- Public copy describes anti-spam, social notifications, AI chat, and auto moderation, but only moderation slash commands and welcome/goodbye configuration have complete repository implementations. Exact delivery/availability status should be confirmed.
- Social and music dashboard pages render preview/disabled UI; they are not full feature implementations.
- Auto moderation, economy, logging, and profile editing are marked coming soon/planned or absent.
- `backend/.env.example` does not include `ALLOWED_WEB_ORIGINS`, although backend config accepts it.
- `REDIS_PASSWORD` appears in backend `.env.example`, but application code uses `REDIS_URL` and does not directly read `REDIS_PASSWORD`; its deployment purpose is unclear.
- The public README says anti-spam/social/AI are product features, but the code currently lacks corresponding complete backend modules/routes. This guide does not infer them as implemented.
- Custom backgrounds are optional and disabled unless Supabase variables are configured.
- Production API health can return 503 for an unhealthy dependency, and backend README notes it is unsuitable for Render restart health checks.
- `backend/src/bot/commands/moderation.guard.ts` and `moderation.service.ts` enforce additional hierarchy/DM/permission behavior; see source before changing moderation rules.
- Test artifacts/directories such as `frontend/test-results/` and `.next` may exist locally and should remain excluded from source tree understanding/build output.
- No Docker Compose file or all-in-one local orchestration file is present.
- The backend E2E suite uses an embedded PostgreSQL instance and either spawns `redis-server` or connects to `DEXBOTX_E2E_REDIS_URL`; Docker Redis is the supported Windows fallback when the executable is unavailable.
- The Drizzle journal includes migration `0005`, while `drizzle/meta/` has only the original snapshot; inspect migration metadata before running `db:generate` to avoid regenerating historical schema changes.
- Auto Roles has helper, service, worker, API end-to-end, and focused dashboard component tests. API E2E covers successful test announcements and the 3/minute rate limit.
- API E2E tests expect a clean Redis database. Use a fresh Docker container per run or clear the dedicated test container before reusing it.
- No separate failed-deliveries table exists for Auto Roles; announcement failures are logged and do not undo role assignment.

## 14. Changelog

| Date | Change | Files/Sections updated |
|---|---|---|
| 2026-11-21 | Initial creation of project guide | `.github/skills/dexbotx-project-guide/SKILL.md` |
| 2026-11-21 | Added UI/UX and frontend skill references | `.github/skills/accessibility/SKILL.md`; `.github/skills/frontend-ui-engineering/SKILL.md`; `.github/skills/ui-skills-root/SKILL.md`; folder structure |
| 2026-11-21 | Added Anthropic frontend-design skill | `.agents/skills/frontend-design/SKILL.md`; `.agents/skills/frontend-design/LICENSE.txt`; `.claude/skills/frontend-design`; `skills-lock.json`; folder structure |
| 2026-11-21 | Added Auto Roles dashboard and backend | `backend/src/shared/auto-roles.ts`; `backend/src/guilds/auto-roles.service.ts`; `backend/src/guilds/guilds.controller.ts`; `backend/src/guilds/guilds.module.ts`; `backend/src/db/schema.ts`; `backend/drizzle/0005_auto_roles.sql`; `backend/src/bot/bot.service.ts`; `backend/src/worker/member-events.processor.ts`; `frontend/src/app/dashboard/[guildId]/auto-roles/page.tsx`; `frontend/src/store/api.ts`; `frontend/src/components/dashboard/nav-config.ts`; relevant guide sections |
| 2026-11-21 | Hardened Auto Roles timing, idempotency, rate-limit rescheduling, permission caching, announcement batching, and tests; enabled Next.js security upgrade nudges | `backend/src/shared/auto-roles.ts`; `backend/src/shared/auto-roles.spec.ts`; `backend/src/guilds/auto-roles.service.ts`; `backend/src/guilds/auto-roles.service.spec.ts`; `backend/src/worker/member-events.processor.ts`; `backend/src/worker/member-events.processor.spec.ts`; `backend/src/bot/bot.service.ts`; `backend/src/bot/guild-sync.service.ts`; `backend/src/bot/guild-sync.service.spec.ts`; `backend/src/discord/discord-rest.service.ts`; `backend/src/db/schema.ts`; `backend/drizzle/0005_auto_roles.sql`; `backend/drizzle/meta/_journal.json`; `backend/test/api.e2e-spec.ts`; `frontend/next.config.mjs`; `frontend/src/app/dashboard/[guildId]/auto-roles/page.tsx`; `frontend/src/store/api.ts`; `frontend/src/components/dashboard/nav-config.spec.ts` |
| 2026-11-21 | Documented Docker-backed Redis; full backend unit (99), API E2E (69), and frontend (53) tests pass after isolating the welcome audit assertion | `backend/test/api.e2e-spec.ts`; `.github/skills/dexbotx-project-guide/SKILL.md` |
| 2026-11-21 | Repaired atomic join-counter TTLs; recovered and drained announcement batches across worker restarts; completed role-picker UI and Auto Roles component/API coverage. Backend unit tests (108), API E2E tests (70), frontend tests (55), typechecks, lint, and builds pass | `backend/src/bot/bot.service.ts`; `backend/src/worker/member-events.processor.ts`; `backend/src/worker/member-events.processor.spec.ts`; `backend/test/api.e2e-spec.ts`; `frontend/src/app/globals.css`; `frontend/src/app/dashboard/[guildId]/auto-roles/page.tsx`; `frontend/src/app/dashboard/[guildId]/auto-roles/page.spec.tsx`; `frontend/package.json`; `frontend/vitest.config.mts`; relevant guide sections |
| 2026-11-21 | Made Auto Roles migration 0005 safe to rerun when its settings column already exists; added E2E coverage for partially applied schema recovery (API E2E: 71 passed) | `backend/drizzle/0005_auto_roles.sql`; `backend/test/api.e2e-spec.ts`; database and test sections |
| 2026-11-21 | Updated Auto Roles preview identity and responsive sidebar; centered role selector and removed role search/hidden-role disclosure | `frontend/src/app/dashboard/[guildId]/auto-roles/page.tsx`; `frontend/src/components/preview/discord-preview.tsx`; `frontend/src/app/dashboard/[guildId]/auto-roles/page.spec.tsx`; frontend sections |
| 2026-11-21 | Fixed Auto Roles hierarchy checks for equal-position roles, refreshes cached bot hierarchy on role events, and made adaptive timing automatic without dashboard delay controls | `backend/src/shared/auto-roles.ts`; `backend/src/bot/guild-sync.service.ts`; `backend/src/bot/bot.service.ts`; `backend/src/guilds/auto-roles.service.ts`; related tests; `frontend/src/app/dashboard/[guildId]/auto-roles/page.tsx`; frontend sections |
| 2026-11-21 | Left-aligned the Auto Roles picker, removed its duplicate selected-role label and announcement-channel search, and retained automatic timing without controls | `frontend/src/app/dashboard/[guildId]/auto-roles/page.tsx`; `frontend/src/app/dashboard/[guildId]/auto-roles/page.spec.tsx`; frontend sections |
| 2026-11-21 | Aligned Auto Roles saving with Welcome/Goodbye: field-level local/server validation, retain drafts after failed saves, and update the guild cache only on success | `frontend/src/app/dashboard/[guildId]/auto-roles/page.tsx`; `frontend/src/app/dashboard/[guildId]/auto-roles/page.spec.tsx`; `frontend/src/store/api.ts`; relevant guide sections |
| 2026-11-21 | Centered the Auto Roles role-picker label and the role/swatch option contents | `frontend/src/app/globals.css`; `frontend/src/app/dashboard/[guildId]/auto-roles/page.tsx`; `frontend/src/app/dashboard/[guildId]/auto-roles/page.spec.tsx`; frontend styling section |
| 2026-11-21 | Refresh missing or legacy bot role hierarchy data from Discord before classifying Auto Roles, preventing a default position-zero cache from hiding every role | `backend/src/bot/guild-sync.service.ts`; `backend/src/bot/guild-sync.service.spec.ts`; `backend/src/guilds/auto-roles.service.ts`; `backend/src/bot/bot.service.ts`; `backend/src/worker/member-events.processor.ts`; relevant guide sections |
| 2026-11-21 | Replaced the custom rich Auto Roles picker with the shared native select used by Welcome/Goodbye for consistent layout and browser-managed outside-click/scroll dismissal | `frontend/src/app/dashboard/[guildId]/auto-roles/page.tsx`; `frontend/src/app/dashboard/[guildId]/auto-roles/page.spec.tsx`; `frontend/src/app/globals.css`; frontend styling section |
| 2026-11-21 | Matched the Auto Roles editor lifecycle and layout to Welcome/Goodbye: sticky preview, live send status, saved-channel warnings, cursor-restored template chips, and the animated Save/Discard bar | `frontend/src/app/dashboard/[guildId]/auto-roles/page.tsx`; `frontend/src/app/dashboard/[guildId]/auto-roles/page.spec.tsx`; frontend components section |
| 2026-11-21 | Added an optional Discord embed to Auto Roles announcements with title, description, footer, colour, live preview, test delivery, and batched worker delivery | `backend/src/shared/auto-roles.ts`; `backend/src/guilds/auto-roles.service.ts`; `backend/src/worker/member-events.processor.ts`; `frontend/src/lib/types.ts`; `frontend/src/app/dashboard/[guildId]/auto-roles/page.tsx`; related specs; frontend and backend sections |
| 2026-11-21 | Matched Auto Roles embed editor to Welcome/Goodbye: separate section, description helper, side-by-side colour/footer fields | `frontend/src/app/dashboard/[guildId]/auto-roles/page.tsx`; `frontend/src/app/dashboard/[guildId]/auto-roles/page.spec.tsx`; relevant guide sections |
| 2026-11-21 | Corrected the persisted Auto Roles SQL default, kept batched announcements isolated by template/role/embed and username, enforced Discord message/embed limits, and included Embed Links in send checks; final backend (118 unit, 72 E2E) and frontend (62) tests pass with typechecks, lint, and builds | `backend/drizzle/0006_auto_roles_defaults.sql`; `backend/src/discord/discord-rest.service.ts`; `backend/src/guilds/auto-roles.service.ts`; `backend/src/shared/auto-roles.ts`; `backend/src/worker/member-events.processor.ts`; related tests; relevant guide sections |
| 2026-11-21 | Reload the complete backend Auto Roles embed config on guild navigation so a prior guild's title, description, or footer cannot persist in the next guild's editor | `frontend/src/app/dashboard/[guildId]/auto-roles/page.tsx`; `frontend/src/app/dashboard/[guildId]/auto-roles/page.spec.tsx`; frontend components section |
| 2026-11-21 | Apply canonical default Auto Roles embed title, description, and footer when saved values are missing or blank | `backend/src/shared/auto-roles.ts`; `backend/src/shared/auto-roles.spec.ts`; backend conventions and changelog |
| 2026-11-21 | Surface Auto Roles channel/activity query failures instead of showing a loading placeholder or empty-activity state | `frontend/src/app/dashboard/[guildId]/auto-roles/page.tsx`; `frontend/src/app/dashboard/[guildId]/auto-roles/page.spec.tsx`; frontend components section |
| 2026-11-21 | Keep Auto Roles saves independent of Discord permission-repair latency, broadcast settings revisions through WebSocket, and convert proxy deadlines to explicit 504 responses | `backend/src/guilds/auto-roles.service.ts`; `backend/src/realtime/realtime.gateway.ts`; `frontend/src/lib/realtime.ts`; `frontend/src/app/api/[[...path]]/route.ts`; related tests; relevant guide sections |
| 2026-11-21 | Show Auto Roles enabled/disabled status and a direct settings link on the guild overview | `frontend/src/components/dashboard/overview-content.tsx`; `frontend/src/components/dashboard/overview-content.spec.tsx`; frontend overview section |
| 2026-11-22 | Replaced colon-containing BullMQ job IDs with validated hyphenated IDs, guaranteed pending-member gating, added elapsed-delay activity/diagnostics, resilient rate-limit rescheduling, and aligned backend documentation | `backend/src/shared/job-id.ts`; `backend/src/queue/member-events.queue.ts`; `backend/src/shared/auto-roles.ts`; `backend/src/bot/bot.service.ts`; `backend/src/worker/member-events.processor.ts`; `backend/src/guilds/guilds.controller.ts`; `backend/src/guilds/auto-roles.service.ts`; `backend/drizzle/0007_auto_roles_30_seconds.sql`; `backend/README.md`; related tests |

## 15. Last updated

2026-11-22
