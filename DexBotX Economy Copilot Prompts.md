# DexBotX Economy Module: Copilot Prompts

How to use this file:

1. Paste the design document into your repo first, at `docs/economy/ECONOMY_DESIGN.md`. Every prompt below tells Copilot to read it, so the prompts stay short and nothing gets lost.
2. Run Phase 0 (the audit) first. Do not skip it. It writes `docs/economy/AUDIT.md` with your real file names and where each economy piece should go.
3. Send me the content of AUDIT.md. I will check it and fix any phase below that does not match your real project.
4. Then run Phase 1, 2, 3 and so on, one at a time, in order. Test and commit after each phase.
5. If Copilot goes wrong on a phase, paste its answer here and I will take over.

Every prompt below starts with a scan of the existing code, reuses what already exists, and only adds what is missing.

---

## Standing rules (these apply to every phase; each prompt repeats the short version)

- Read `docs/economy/ECONOMY_DESIGN.md` and `docs/economy/AUDIT.md` before doing anything.
- Scan existing code first. Reuse existing helpers, services, guards, logger, config, embed builders, queues and UI components. Do not create a second version of anything that already exists.
- Follow the existing folder structure, naming, lint and formatting rules.
- Do not change existing features, existing database tables, the existing dashboard pages, the admin panel or the key logic of existing modules. Only add the economy module and the smallest possible hooks into existing files.
- All coin amounts are integers. All balance changes happen inside one database transaction with conditional updates.
- Never trust input from the client or from Discord options without validation.
- No secrets in code. Any new environment variable must be added to the config validation, `.env.example` and the docs.
- Finish each phase with: a list of files created, a list of files changed, how to test it, and anything left undone.

---

## Phase 0: Audit (read only, no code changes)

```
You are auditing this repository before we add an economy module. Do NOT write or change any application code in this phase. The only files you may create are docs/economy/AUDIT.md (and docs/economy/ECONOMY_DESIGN.md if it does not exist yet, using the text I paste).

Read docs/economy/ECONOMY_DESIGN.md fully first. Then scan the whole repo (frontend and backend folders) and write docs/economy/AUDIT.md answering every point below with real file paths and short code references. If something does not exist, write "not found". If you are unsure, say so. Do not guess.

1. Project layout: top-level folders, package manager, frontend and backend frameworks and versions, how they are run locally, how they are deployed, scripts in each package.json.
2. Backend structure: module layout (NestJS modules, controllers, services, providers), where Discord bot code lives, whether the bot runs in the same process as the API, how sharding is set up and how the API talks to shards (broadcastEval, IPC, Redis pub/sub, etc).
3. Discord command system: how slash commands are defined, registered (global or guild) and dispatched. Where button, select menu, modal and autocomplete interactions are handled. Existing cooldown or permission helpers. Show one complete example of an existing command from definition to reply.
4. Existing features to learn from: welcome and goodbye card flow, moderation commands and any case or mod-log tables, auto roles, anti-spam, auto moderation, AI auto chat, social notifications, music. For each, list the files and how its per-server settings are stored and cached.
5. Database: ORM and driver, schema file locations, naming conventions (table and column names, id types, timestamps), migration tool and the exact commands to generate and run migrations, whether numbers are int or bigint, how transactions are done, where seed or default data is created, the Supabase connection details only in terms of env variable NAMES (never print secret values).
6. Redis and queues: what Redis is used for, BullMQ queues and workers that already exist, repeatable jobs, how Redis failures are handled, any free-tier limits or memory limits mentioned in code or docs.
7. Scheduling and time: existing cron or job code, any date or time zone library already installed (luxon, date-fns-tz, dayjs, moment), how per-server time zones are handled if at all.
8. Auth and dashboard API: how login works (Discord OAuth, session cookie), the guard that checks "manage server" permission for a guild, request validation approach (class-validator, zod, DTOs), rate limiting, CORS, how the frontend proxy forwards /api requests.
9. Frontend structure: App Router layout, where dashboard pages live, how a module page (for example Welcome or Goodbye) is built from route to component to API call, RTK Query API slices and tag invalidation, shared UI components, the design tokens and colours used (dark theme, page background, blurple buttons), loader and navigation patterns including the phone bottom nav. Note the rules already decided: no font changes, no Discord artwork or logo copying, keep the dashboard and admin panel logic unchanged.
10. Shared types: how types or DTOs are shared or duplicated between frontend and backend, and where drift is likely.
11. Config and secrets: config module, environment validation, list of existing env variable NAMES, .env.example.
12. Logging and errors: logger, Sentry setup, how errors in command handlers are reported to the user.
13. Testing and CI: test framework, existing tests, lint and type-check scripts, GitHub workflows (including CodeQL).
14. Security notes: anything that looks risky in the existing code that the economy module must not copy (missing validation, missing permission checks, unbounded queries, secrets in logs).
15. Existing leftovers: any code, tables, commands or pages already named economy, coins, wallet, shop or leaderboard.

Then end AUDIT.md with these sections:

A. Where each economy piece should live: a table mapping each of these to real folders and file names that follow the existing conventions: schema and migration, wallet service, economy setup service, /economy command group, member commands, button and select handlers, message builders (rules, panel, store, leaderboard, countdown), scheduler jobs, dashboard REST endpoints and DTOs, frontend Economy page, RTK Query slice, shared types, tests.
B. Conflicts and risks: anything in the design doc that does not fit this project (for example a different database, bot and API running separately, no BullMQ, no time zone library), with a proposed fix for each.
C. New dependencies we would need, each with a reason, and whether an existing dependency can do the job instead.
D. Open questions for me (the owner) before coding starts.

Keep AUDIT.md factual and short. No code in it except tiny references.
```

---

## Phase 1: Database schema, settings validation and the wallet service

```
Read docs/economy/ECONOMY_DESIGN.md (sections 11 and 12) and docs/economy/AUDIT.md first. Scan the existing schema, migration setup and services, and reuse their patterns. Do not change any existing table.

Build the economy data layer in the locations AUDIT.md section A lists.

1. Schema and migration: create tables economy_settings, wallets, wallet_effects, shop_items, daily_claims, steal_windows, steal_log, bounties, transactions and economy_audit_log exactly as described in section 12 of the design doc, following the project's naming, id and timestamp conventions. Required constraints:
   - wallets: unique(guildId, userId), CHECK balance >= 0.
   - daily_claims: unique(guildId, userId, localDate).
   - steal_log: partial unique index on (windowId, victimId) where kind = 'steal'.
   - economy_settings: unique(guildId).
   - indexes: wallets(guildId, balance desc) for the leaderboard, steal_log(windowId, thiefId), transactions(guildId, userId, timestamp).
   Generate the migration with the project's migration tool and show me the exact command to run it. Do not run it against production.
2. Settings: one constants file with every default and every minimum and maximum from section 11. One validation schema (using the validation approach AUDIT.md found) that rejects anything outside those ranges, rejects non-integers and rejects unknown fields. Export types for use by the frontend.
3. Time helpers: functions to get the server's local date string, the week key (local date of the most recent Sunday), the next steal window open and close times as UTC, and whether a time is inside a window. Use the time zone library the project already has, or the one AUDIT.md recommends. Add unit tests that include a time zone with daylight saving and Asia/Kathmandu.
4. Wallet service: the ONLY place that changes balances. Methods: getOrCreateWallet, addCoins, removeCoins (fails if it would go below zero or below a given floor), transfer, claimDaily, gift, and a helper that runs a callback inside one transaction. Every change writes a transactions row in the same transaction. Use conditional updates (UPDATE ... WHERE balance >= amount) so two parallel requests cannot overspend. When two wallets are locked in one transaction, always lock the lower userId first to avoid deadlocks.
5. claimDaily: uses the local date key and the unique daily_claims index, handles the week key and streak rules (section 2a), adds Daily Boost bonus if active, caps by streakCapDays, and returns streak day, amount paid and next claim time.
6. gift: enforces send and receive weekly limits using the week key, the floor rule, the eligibility rules (account age and time in server are passed in by the caller) and refuses during an open steal window.
7. Tests: for every rule above, including parallel calls (use Promise.all with 20 simultaneous claimDaily or removeCoins calls and prove only the right ones succeed) and the DB CHECK constraint.

Do not add commands, channels, scheduler or dashboard yet. When finished, list files created and changed, the migration command, and how to run the tests.
```

---

## Phase 2: Setup service, /economy commands, channels and default store

```
Read docs/economy/ECONOMY_DESIGN.md (sections 3, 6, 7, 14, 15) and docs/economy/AUDIT.md first. Scan how existing commands, guild settings, permissions checks and channel creation (if any) are done and reuse them.

Build EconomySetupService and the /economy command group.

1. EconomySetupService with enable(guildId, actorId, source), disable, pause, resume, status and repair. enable is idempotent and doubles as repair: it creates only what is missing and never duplicates. It must:
   - Check the bot has: View Channels, Manage Channels, Manage Roles, Send Messages, Embed Links, Manage Messages, Read Message History. If anything is missing, return a clear list and create nothing.
   - Take a per-server lock (use the existing Redis helper if present) so a dashboard click and a command at the same time cannot run twice. If the lock is held, return "setup already running".
   - Create the Economy category and these channels in this order: economy-rules, economy-commands, leaderboard, store, heist-log, economy-announcements, with the permission overwrites from the table in section 6 of the design doc (read-only for everyone except economy-commands).
   - Save every channel ID in economy_settings. If a saved ID points to a deleted channel, recreate that channel only.
   - Seed the default store (section 3b) the first time only, using the defaultsSeeded flag. For the four default roles create them with the bot: no permissions, not hoisted, not mentionable, a distinct colour each. If the bot cannot create roles, still create the other items and report the roles as skipped.
   - Write an economy_audit_log row for every call.
   - Work if the bot is on a sharded setup: run Discord actions on the shard that owns the guild, using the mechanism AUDIT.md found.
2. Role safety helper: a function that says whether a role can be sold. It must refuse roles that have Administrator, Manage Server, Manage Roles, Manage Channels, Manage Webhooks, Ban Members, Kick Members, Moderate Members, Manage Messages or Mention Everyone, roles at or above the bot's highest role, managed (integration) roles and @everyone. Add tests.
3. /economy command group (Manage Server set as default member permission AND checked again in code): on, off, pause, resume, status, give, take, reset (reset needs a confirm button). give, take and reset write to transactions with the staff member's ID and to the audit log. Every reply is ephemeral. The command must defer the interaction immediately because setup can take longer than 3 seconds.
4. A shared guard used by all economy commands and buttons (built now, used in later phases): economy enabled, not paused, running in the economy-commands channel (otherwise reply privately with a link to the channel), per-user cooldown from settings, and eligibility rules. Staff /economy commands bypass the pause and channel rules.
5. Expose enable, disable, pause, resume and status through a service interface so the dashboard in Phase 6 calls exactly the same code as the command.
6. Register the new commands using the project's existing registration method. Do not break existing commands.
7. Tests: enable twice creates nothing new, deleted channel is recreated without duplicates, missing permissions create nothing, role safety helper, pause blocks member commands.

Do not build the panel, store, leaderboard, rules, countdown messages or member commands yet. Use clearly marked placeholder calls where those will plug in.
```

---

## Phase 3: Message builders (rules, panel, store, leaderboard, countdown)

```
Read docs/economy/ECONOMY_DESIGN.md (sections 5, 6, 13) and docs/economy/AUDIT.md first. Scan the existing embed builders and welcome/goodbye card code and reuse their style, colours and helpers. No copying of Discord logos or artwork.

Build message builders and updaters, and plug them into EconomySetupService from Phase 2.

1. Rules channel: build the six embeds from section 13 of the design doc using the exact simple wording given there, filling the { } values from the server's economy_settings and the real shop items. Post them in order, store the message IDs in rulesMessageIds and a hash of the rendered text in rulesHash. Add updateRules(guildId) that edits the messages only if the hash changed and recreates any deleted message. Respect Discord limits (4096 characters per embed description, 6000 per message); split embeds if needed.
2. Panel message in economy-commands with three buttons: My Balance, Claim Daily, Shop. Pin it. Store panelMessageId. Button handlers come in Phase 4; for now register the custom IDs and return a harmless "coming soon" ephemeral reply.
3. Store message in the store channel: one embed listing every enabled item with price and a one-line meaning, and a Buy button per item (a select menu when there are more than 20 items). Add updateStore(guildId) called whenever items change. Show steal-related items as "available after the window" while a window is open (read the window state from the database).
4. Leaderboard: one embed in the leaderboard channel with exactly the top 10 by balance, excluding bots and members who left. Add refreshLeaderboard(guildId) that edits the same message and only edits when the top 10 changed. Tie-break by totalEarned then userId. Use the balance index and a short-lived cache. Recreate the message if it was deleted.
5. Countdown message in economy-announcements using Discord native timestamps (<t:UNIX:R>), pinned. Add updateCountdown(guildId, state). Recreate and pin if deleted.
6. Mentions safety: every message the economy sends must disable all mention parsing. Only the optional victim ping may mention exactly one user.
7. Heist log queue: a small per-channel queue that spaces messages out so Discord rate limits are not hit, with retry on failure. Build it now, used in Phase 5.
8. Tests: rules hash only edits on change, deleted messages are recreated, leaderboard order and exclusions, embeds stay inside Discord limits, no mention can fire.

Do not build commands or the scheduler yet. Finish with how to test it manually in a test server.
```

---

## Phase 4: Member commands, buttons and shop

```
Read docs/economy/ECONOMY_DESIGN.md (sections 2a, 3, 4, 7) and docs/economy/AUDIT.md first. Scan the existing command and interaction handlers and reuse their patterns. Use the wallet service from Phase 1 and the guard from Phase 2 for every command. Defer every interaction first, then work, then reply.

Build:

1. /reward: calls claimDaily. Reply (ephemeral) with coins received, streak day, and when the next claim opens. If already claimed, say when the day changes in the server time zone. Post streak milestones to the announcements feed only if that event is enabled.
2. /balance: coins, rank, streak, active items (Shield charges left, Rob More, Lockpick, Decoy, Daily Boost days left), steal stats, and whether the economy is currently in a steal window. Never show other members' balances.
3. /shop and /buy with autocomplete on item names. Rules:
   - Check enabled, stock and eligibility.
   - Steal-related items (shield, rob_more, lockpick, decoy, bounty) are refused while a window is open, with a friendly message.
   - Shield cannot be bought while charges remain.
   - Role item: if the member already has the role, do not charge. Otherwise inside one transaction take the coins, assign the role, and if assigning fails refund and log. The role must pass the Phase 2 role safety helper at purchase time too.
   - Custom Title: ask for the text with a modal. Max 20 characters. Strip mentions, links and invite links, and run it through the existing auto moderation word filter if one exists.
   - Bounty Poster: ask for the target with a user select menu in an ephemeral reply, then the amount with a modal (min and max from settings). Hold the coins in escrow (bounties table plus a transactions row). One active bounty per target. Cannot target yourself or a bot.
   - Daily Boost: adds a wallet_effects row for 7 days.
   - Add the effect rows for shield, rob_more, lockpick and decoy with the right remainingWindows (shield 2, others 1). They become active at the next window open.
   - After a successful purchase, call updateStore and post to the announcements feed only for visible event types (role, custom title). Never announce Shield, Rob More, Lockpick, Decoy, Daily Boost or Bounty purchases.
4. /gift: calls the wallet service gift. Announce gifts (sender, receiver, amount) in the announcements feed.
5. /leaderboard: ephemeral top 10 plus the member's own rank.
6. /economy help: short guide and a link to the rules channel.
7. Panel and store buttons: wire My Balance, Claim Daily and Shop, and the store Buy buttons, to the same code as the commands. All replies ephemeral.
8. Tests: every purchase rule, refund on role failure, parallel /buy with a low balance cannot overspend, bounty escrow, gift limits and window block.

Do not build the scheduler or /robuser yet.
```

---

## Phase 5: Scheduler and /robuser

```
Read docs/economy/ECONOMY_DESIGN.md (sections 2b, 2c, 9, 10) and docs/economy/AUDIT.md first. Scan the existing queue, worker and cron code and reuse it. Do not add a second scheduler system and do not run a loop that scans every server every minute.

Build:

1. Window scheduler using the existing job system. When the economy is enabled, and after each window closes, compute the next open and close times in the server time zone and schedule two delayed jobs for that server. Jobs must be safe to run twice (idempotent) and must be removed when the economy is turned off or the bot leaves the server.
2. Window open job: create the steal_windows row with a snapshot of the rules (steal amount, max steals, floor, min steal, bounty limits), mark status open, post the open banner to heist-log through the queue, update the countdown message.
3. Window close job: set status closed, use up one Shield charge for members who had one, expire Rob More, Lockpick and Decoy, refund unclaimed bounties (transaction rows), post the summary (total stolen, top thief, most-robbed victim) and update the countdown, then schedule the next window.
4. Hourly job: refreshLeaderboard for every enabled server, and a light repair check that recreates deleted economy messages.
5. Startup reconcile: on bot start, for every enabled server, if a window should be open and has no row, open it late (lateOpen = true) and close it at the original end time; if a window ended while offline, close and settle it; never open a window whose end time has passed.
6. /robuser user: implement exactly the ordered checks in section 9 of the design doc, in one database transaction, using the snapshot rules from the window row. Required behaviour:
   - Refusals for low balance, Shield (without Lockpick) and "already robbed" use generic wording that does not reveal the reason, do not consume a steal and are not logged publicly.
   - A Decoy is used up, gives the thief nothing, consumes one of their steals and inserts a steal_log row with kind decoy. It does not mark the victim as robbed.
   - Successful steal: amount = min(steal amount or double with Rob More, victim balance minus floor). Move coins, write steal_log and transactions, pay an active bounty from escrow to the thief and mark it claimed.
   - Two thieves hitting the same victim at the same moment: exactly one succeeds (partial unique index plus the transaction).
   - After commit: queue the heist-log embed and optionally ping the victim (pingVictim setting), mirror to announcements if the owner enabled it.
7. Tests: every check and its order, generic refusals, decoy behaviour with and without Lockpick, Rob More and floor, bounty payout and refund, 50 parallel steal attempts on one victim, late open and reconcile logic, settings changed mid-window do not affect the open window.

Mention in your notes how this behaves if the host sleeps (free tier) and what the owner should do about it.
```

---

## Phase 6: Dashboard (backend endpoints and frontend page)

```
Read docs/economy/ECONOMY_DESIGN.md (sections 11 and 14) and docs/economy/AUDIT.md first. Scan how an existing module page (for example Welcome) goes from route to component to API call, and copy that pattern exactly.

Backend:
1. REST endpoints under the existing API prefix, protected by the existing login session and the existing "manage server" guard: get economy state and settings, enable, disable, pause or resume (kill switch), update settings, list items, create, update, delete and reorder items, list roles that are safe to sell (using the Phase 2 role safety helper), and "delete economy channels" (needs an explicit confirm flag, never deletes wallet data).
2. enable, disable, pause and resume must call the same EconomySetupService methods the /economy command uses. Do not duplicate logic.
3. Validate every request with the Phase 1 schema (hard ranges). Reject unknown fields. Rate limit the write endpoints using the project's existing rate limiter. Write an economy_audit_log row for every change (source = dashboard).
4. After settings or items change, call updateRules, updateStore and updateCountdown so the Discord messages stay in sync.
5. Return clear error messages for missing bot permissions and for roles that cannot be sold.

Frontend:
1. Add an Economy section reachable the same way as the other modules, including the phone bottom nav only if the existing nav pattern allows it without changing its behaviour.
2. Page content: enable toggle with a status checklist (each channel and message: ok or missing), kill switch, settings form (section 11 values with the same min and max as the backend, using the shared types), channel choice for the heist log, victim ping toggle, announcement event toggles, store manager (default items shown, edit price and name, enable, disable, delete, add item, add role item using the safe role picker with greyed-out unsafe roles and the reason shown).
3. Use the existing design: dark theme, existing background and colour tokens, blurple buttons in the same style, existing components, loader and animations. No new fonts, no Discord logo or artwork, no changes to the existing dashboard, admin panel or their logic.
4. Use RTK Query with proper tag invalidation, the memory-only frontend cache approach already used, and the same error and loading patterns as other pages.
5. Make it work on phones.

Tests: backend permission tests (a user without Manage Server gets 403 on every endpoint), validation tests, and a type check proving frontend and backend share the same settings types.
```

---

## Phase 7: Hardening, tests and sync check

```
Read docs/economy/ECONOMY_DESIGN.md (section 8 especially) and docs/economy/AUDIT.md first. This phase changes code only to fix problems you find.

1. Go through the anti-exploit table in section 8 line by line. For each row, show the file and the test that proves the defence. If a defence or a test is missing, add it.
2. Review every economy query and endpoint for: missing permission checks, missing validation, unbounded queries, N+1 queries, balance changes outside the wallet service, floating point maths, secrets or user input in logs, and mentions that could ping people.
3. Confirm every balance change writes a transactions row, and write a script or test that checks that the sum of wallets changes equals the sum of transactions for a test scenario.
4. Sync check, and fix any drift: slash commands registered match the command list in the design doc and in the rules embed; settings defaults and ranges are identical in constants, backend validation, frontend form and rules text; the dashboard shows exactly what the bot does; env variables are in config validation, .env.example and docs; migrations apply cleanly on an empty database and on a copy of the current one; no unused code.
5. Run lint, type check and all tests for both frontend and backend. Fix everything that fails.
6. Run a load check: 100 parallel /reward, /buy and /robuser calls against a test database with no negative balance and no duplicate rewards.
7. Update docs: docs/economy/ECONOMY_DESIGN.md if anything changed during the build, a short docs/economy/OPERATIONS.md (how to enable, pause, repair, reset, read the audit log, what to do if the bot was offline on a Sunday), and, if the repo has a .github/skills project overview file, add the economy module to it and make sure it says it must be updated whenever the structure changes.
8. Give me a final report: what was verified, what could not be verified (and why), known limits, and a short manual test checklist for a real test server (enable with /economy on, delete a channel and repair, claim daily twice, buy each item, run a full Sunday window with three accounts, pause and resume, disable).
```
