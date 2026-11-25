# DexBotX Economy Audit

> Historical pre-implementation audit. Statements below describe the repository before the economy was implemented and are not current status. Use `ECONOMY_DESIGN.md`, `OPERATIONS.md`, and the current source for the implemented system.

## Project layout

- Monorepo with separate `backend/` NestJS service and `frontend/` Next.js App Router application.
- Backend and frontend use npm; backend scripts provide build, lint, typecheck, Jest unit tests, E2E tests, Drizzle migrations and Discord command deployment.
- Deployment is Docker/Render: `backend/render.yaml` runs separate API, bot, shard and worker services; `frontend/Dockerfile` builds standalone Next.js.

## Backend structure

- Domain modules live under `backend/src/<domain>`. API entry point is `backend/src/main.ts`; application context is assembled in `app.module.ts`.
- Discord shards start in `backend/src/bot/manager.ts` and `backend/src/bot/shard.ts`. Gateway behavior lives in `backend/src/bot/bot.service.ts`.
- BullMQ queues live under `backend/src/queue/`; `backend/src/worker/member-events.processor.ts` consumes member jobs.
- The bot and API are separate processes, but both share PostgreSQL and Redis. Guild-owned Discord actions should execute on the shard where the guild is available.

## Discord commands and interactions

- Commands use Discord.js `SlashCommandBuilder` files under `backend/src/bot/commands/`.
- `backend/scripts/register-commands.ts` deploys the exported command array with global or `--guild` routes.
- `BotService` receives `InteractionCreate` and currently delegates chat commands to `ModerationService`.
- Economy commands and components will be added to this same interaction event and exported registration list.
- Existing permission and cooldown patterns are in `backend/src/bot/moderation.service.ts` and `backend/src/bot/commands/moderation.guard.ts`.

## Existing domain patterns

- Welcome/goodbye settings are cached in `backend/src/redis/settings-cache.service.ts` and saved by `backend/src/welcome/welcome.service.ts`.
- Guild access and synchronization are in `backend/src/guilds/guild-access.guard.ts`, `guilds.service.ts`, and `backend/src/bot/guild-sync.service.ts`.
- Auto roles demonstrate Redis locks, BullMQ scheduling, Discord role checks, activity records and announcement batching.
- Moderation uses Discord REST, Redis rate limits, Prometheus metrics and `mod_actions`.
- Automatic moderation, economy and music do not have complete implementation modules.

## Database

- PostgreSQL uses Drizzle ORM and `postgres` in `backend/src/db/database.service.ts`.
- Tables are declared in `backend/src/db/schema.ts`; SQL migrations are in `backend/drizzle/`.
- Existing IDs use Discord snowflake strings, integer counters and `bigserial` audit IDs. Timestamps use timezone-aware PostgreSQL timestamps.
- Drizzle transactions are expected through `DatabaseService.db.transaction(...)`.
- Generate migrations with `npm run db:generate`; run compiled migrations with `npm run db:migrate`.

## Redis and queues

- `backend/src/redis/redis.service.ts` owns Redis connections and pub/sub.
- `backend/src/queue/member-events.queue.ts` provides the existing `member-events` BullMQ queue.
- Economy jobs should extend the existing queue or use a clearly named economy queue in the same Redis/BullMQ infrastructure.
- Redis locks and Lua scripts are used for pacing and setup deduplication elsewhere.

## Scheduling and time

- Luxon 3.7.2 is present in the backend lockfile, but should be declared directly before economy code imports it.
- No mature global cron package is present. BullMQ delayed jobs are the scheduling convention.
- Local calendar/date logic must use IANA time zones. The local date and week key are database strings.

## Auth and dashboard API

- Discord OAuth and Redis-backed sessions are in `backend/src/auth/`.
- `GuildAccessGuard` checks Discord Manage Server/Administrator access and installed guild state.
- Request validation uses Zod plus `ZodValidationPipe`.
- `RequestGuard` and `@RateLimit` provide session/rate-limit protection.
- Next.js `/api/[[...path]]/route.ts` proxies dashboard requests to NestJS.

## Frontend

- App Router pages live under `frontend/src/app/dashboard/[guildId]/`.
- Existing module pages use RTK Query endpoints in `frontend/src/store/api.ts`, shared types in `frontend/src/lib/types.ts`, and Tailwind components under `frontend/src/components/ui/`.
- Dashboard and phone navigation patterns live in `frontend/src/components/dashboard/`.

## Shared types and configuration

- Backend and frontend currently duplicate message/types rather than sharing a workspace package. Economy types must be mirrored intentionally until a shared package is introduced.
- Backend config uses Zod in `backend/src/core/config.ts`; no economy-specific environment variable is currently required.

## Testing

- Backend uses Jest/ts-jest and Supertest.
- Frontend uses Vitest and Testing Library.
- CI runs lint, typecheck, tests and builds for both packages.

## A. Economy integration map

| Piece | Integration location |
|---|---|
| Schema/migration | `backend/src/db/schema.ts`; `backend/drizzle/` |
| Constants/settings validation/time helpers | `backend/src/economy/economy.constants.ts`; `economy.schema.ts`; `economy-time.ts` |
| Wallet service | `backend/src/economy/wallet.service.ts` |
| Setup and role safety | `backend/src/economy/economy.service.ts`; `backend/src/economy/economy-setup.service.ts`; `economy-safety.ts` |
| Discord commands | `backend/src/bot/commands/economy.ts` and nearby economy command files; `BotService` interaction dispatch |
| REST/Dashboard | `backend/src/economy/economy.controller.ts`; `economy.module.ts` |
| Scheduler/worker | Existing member-events BullMQ queue and worker, or a dedicated economy queue under `backend/src/economy/` |
| Frontend page | `frontend/src/app/dashboard/[guildId]/economy/page.tsx` |
| RTK endpoints/types | `frontend/src/store/api.ts`; `frontend/src/lib/types.ts` |
| Tests | `backend/src/economy/*.spec.ts`; `frontend/src/app/dashboard/[guildId]/economy/page.spec.tsx` |

## B. Conflicts and risks

- The bot, API and worker are separate processes. Economy setup and scheduler actions must use database/Redis state and Discord actions only on the bot shard.
- A BullMQ economy job can carry guild IDs and no secret state; settings and window snapshots remain in PostgreSQL.
- Luxon will be added as a direct backend dependency to replace transitive lockfile usage.
- There is no existing economy or shared cross-package type package, so initial implementation may intentionally mirror types.

## C. New dependencies

- Luxon: direct IANA timezone and DST support. Existing transitive lockfile copy is not sufficient for stable imports.
- No new state manager or UI library is needed.

## D. Open questions

- None for the initial implementation: the supplied economy design provides defaults, limits and behavior.
