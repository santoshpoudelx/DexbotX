# Economy Docker Test Report

> Historical test snapshot. These results record an earlier test run and are not a current production-readiness certification. See the current design and operations guides for shipped behavior.

Run date: 2026-11-23

| # | Scenario | Result | Notes |
|---|---|---|---|
| 1 | Docker environment and migration | PASS | PostgreSQL 18.7 and Redis 7.4.11 started healthy; migrations applied. |
| 2 | Settings validation | PASS | Defaults, integer ranges and unknown-field rejection passed. |
| 3 | Daily claim and duplicate claim | PASS | One wallet grant per local date. |
| 4 | 20 simultaneous daily claims | PASS | Exactly one concurrent claim granted coins. |
| 5 | 20 simultaneous coin removals | PASS | Exactly 10 successful removals left a 0 balance. |
| 6 | Wallet database CHECK | PASS | Negative balances were rejected. |
| 7 | Time-zone/DST helpers | PASS | Kathmandu date and New York DST window passed. |
| 8 | Gift transaction pairs | PASS | Sender/receiver gift rows were both written. |
| 9 | Dex names and store prices | PASS | Unit formatting tests and exact default store snapshot passed. |
| 10 | Custom Title and Bounty escrow | PASS | Sanitization, active bounty escrow and refund rows passed. |
| 11 | Steal victim race | PASS | Partial unique index allowed exactly one concurrent successful steal. |
| 12 | Effects and stock | PASS | Shield/Rob More/Lockpick/Decoy and stock storage passed. |
| 13 | Leaver wallet visibility | PASS | Left members were excluded from the visible leaderboard set. |
| 14 | Frozen window snapshot | PASS | Window rules remained distinct from later settings. |
| 15 | Decoy log | PASS | Decoy entries did not mark victims as successful steals. |
| 16 | Pause and staff audit state | PASS | Pause state and audit row state stored correctly. |
| 17 | Weekly gift totals | PASS | Sent and received totals remained week-keyed. |
| 18 | Leaderboard tie data | PASS | Total-earned and balance tie data stored correctly. |
| 19 | Dex mention-free formatting | PASS | Formatter returns thousands-separated Dex with no dollar sign. |
| 20 | Full weekly reward | PASS | Seven-day sequence totals 455 Dex. |

Duration: 15.303 seconds for the final visible 20-case Jest economy suite.

## Bugs found and fixed

- Daily Boost lookup used a raw Date inside a `sql` predicate and failed binding in Postgres.
- Replaced it with Drizzle `gt`/`isNull`/`or` expressions.
- Daily concurrent claim testing now counts only responses with `claimed === true`; duplicate responses return safely without granting coins.
- PostgreSQL 18 test mount was corrected from `/var/lib/postgresql/data` to `/var/lib/postgresql`.

## Not run in Docker

- Live Discord permissions, channel overwrites, role assignment, pins and component rendering.
- The full 20-scenario Discord/manual matrix.
- BullMQ window jobs against a real Discord gateway.
- Production database migration copy.
- 100 parallel mixed live slash-command calls.
- Full live Discord setup, permission repair, pins and component interaction behavior.
- Real production database copy migration verification.

## Limitations

The Docker suite verifies economy database behavior and migration compatibility. Discord interaction routing and the exact anonymous bounty announcement payloads are covered by focused backend unit tests rather than the Docker E2E suite.

## Dex value update

- Migration command: `cd backend && npm run db:generate && npm run db:migrate`
- The repository now includes `backend/drizzle/0009_economy_dex_names_prices.sql`.
- Existing untouched default items are updated from old default prices. Items with edited prices or custom items are not changed.
- Existing economy settings missing `currencyName` or `economyName` receive `Dex` and `Dex Economy` defaults.

## Verification run: 2026-11-24

| Suite | Result | Notes |
|---|---|---|
| Economy Docker integration | PASS | Docker Postgres/Redis, migrations and all 21 cases passed; teardown completed. Includes concurrent weekly gift-send and receive limit checks. |
| Backend unit tests | PASS | 23 suites, 141 tests. |
| Full backend E2E | PARTIAL | Economy E2E passed; 93 tests passed overall and 3 unrelated API E2E assertions failed. Details below. |
| Frontend tests | PASS | 13 files, 71 tests. |
| Backend typecheck/build | PASS | Both completed successfully. |
| Frontend typecheck | PASS | Completed successfully. |
| Targeted ESLint | PASS | All changed backend economy source and test files passed. |

### Security regressions fixed

- Concurrent gifts now lock both wallet rows in deterministic order before checking and updating weekly counters. The Docker test confirms the configured send and receive caps hold under concurrent requests.
- Economy buttons, select menus and purchase modals now reject member actions while disabled or paused.
- Wallet reset confirmations are requester-bound, re-authorized at click time, expire after five minutes, and are atomically consumed once.

### Not run

- The exhaustive exploit/fuzz/load/fault-injection matrix and full design-rule traceability table were not run.
- The local dashboard and API were started against Docker Postgres/Redis. OAuth completed in the browser, but the economy page hit Discord HTTP 429. No account password was entered by automation.
- The bot-token identity preflight returned HTTP 401; no guild request was made and the bot was not started. Live Discord setup, channel/message changes and manual economy interactions were not performed.
- Three API E2E failures remain outside the economy fixes: role creation expected `hoist: true` but received `hoist: false` and `color: 0`; guild onboarding's bot-member mock has no `roles.highest`; the Redis connection budget expected at most 10 clients but observed 11.
- `local.testing.discord` is ignored locally but appears in Git history. Credential values were not printed or included in reports; the bot-token value was used only for the read-only identity preflight.
- Fuzz seeds: none; randomized fuzzing was not run.

## Follow-up verification: 2026-11-24

| Suite | Result | Notes |
|---|---|---|
| Economy Docker integration | PASS | Isolated PostgreSQL/Redis containers, migrations, and all 22 economy E2E cases passed in 14.661 seconds; containers and network were removed. Includes idempotency-before-tool precheck coverage. |
| Economy command/message unit tests | PASS | 34 tests passed, including missing-tool precedence, eligibility and robbery error messages, and anonymous bounty placement/claim announcements. |
| Backend typecheck | PASS | `npm run typecheck`. |
| Backend build | PASS | `npm run build`. |
| Targeted ESLint | PASS | Changed bounty announcement and economy command files. |
| Frontend lint/typecheck/build | PASS | All three completed successfully after the dashboard timeline removal. |
| Frontend tests | PASS | 13 files and 71 tests passed. |

### Bug found and fixed

- The Docker runner launched `npx` with `spawnSync`, which cannot resolve the Windows `npx.cmd` shim. The failed child process returned a null status that the runner treated as success, so the first run did not execute Jest. The runner now invokes Jest through the current Node executable and prints child-process launch errors; the verified rerun above executed all 21 cases.

### Not run in this follow-up

- Live Discord announcements, permissions, interactions, or production database operations. Bounty announcement payloads and handler routing were verified by unit tests only.

## Robbery limits verification: 2026-11-24

| Suite | Result | Notes |
|---|---|---|
| Economy Docker integration | PASS | PostgreSQL (`postgres:18-alpine`) and Redis (`redis:7-alpine`); migration 0011 applied; 23 tests passed in 10.404 seconds. |
| Legacy data migration | PASS | A floor below 50 was raised to 50, a default Rob More item was disabled, and a custom Rob More row remained enabled. |
| Robbery limits | PASS | A standard and legacy Rob More robbery were each capped at 200 Dex; a 125-Dex victim retained exactly 50 Dex; one tool allowed only one successful robbery. |
| Economy command/message unit tests | PASS | 34 tests passed. |
| Backend typecheck/build/lint | PASS | All completed successfully; lint covered the changed economy and command files. |
| Frontend typecheck/lint/tests/build | PASS | All completed successfully; Vitest: 13 files and 71 tests. |

Migration for an existing deployment: build the backend, then run `npm run db:migrate` from `backend/`. Existing configured robbery amounts are not raised by this migration; new economies default to 200 Dex, and all robberies remain hard-capped at 200 Dex.

### Not run

- Live Discord interactions, announcement delivery, bot permissions, and production database operations.
- The exhaustive exploit/fuzz/load/fault-injection matrix. No fuzz seeds were used.

## Store and acknowledgement follow-up: 2026-11-24

| Suite | Result | Notes |
|---|---|---|
| Bot/economy command unit tests | PASS | 36 tests passed; includes immediate gateway acknowledgement and expired-interaction logging. |
| Backend typecheck/lint | PASS | Passed for the gateway and economy setup changes. |

`/economy on` now disables any remaining default Rob More row and refreshes the existing Discord store message after seeding. Apply migration 0011 first, then run `/economy on` (or dashboard Enable/repair) to update the live store message.
