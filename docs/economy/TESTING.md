# DexBotX Economy Module: Final Testing Prompt (Phase 8, with Docker)
 
## Implementation status

Use these commands from `backend/`:

- `npm run economy:test:up` starts isolated PostgreSQL 18 and Redis 7 containers.
- `npm run economy:test:migrate` applies the real Drizzle SQL migrations to the Docker database.
- `npm run economy:test:run` runs `test/economy.e2e-spec.ts`.
- `npm run economy:test:down` removes containers and tmpfs volumes.
- `npm run economy:test` starts containers, migrates, runs tests, and always tears down.

Ports:

- PostgreSQL: `127.0.0.1:5433`
- Redis: `127.0.0.1:6380`

The runner refuses to run unless `TEST_DATABASE_URL` targets localhost port 5433 and `TEST_REDIS_URL` targets localhost port 6380. Never use production credentials.

Reset state:

- The Docker database is stored in tmpfs and every run starts clean.
- Each Jest scenario truncates economy tables and flushes Redis.

Read [TEST_REPORT.md](./TEST_REPORT.md) for results and known limitations.

Current behavior checks: economy channels are public, regular member messages are blocked, and slash commands work only in `economy-commands`. Successful daily claims are announced persistently in that channel; private economy interaction replies expire after 60 seconds. Currency is fixed to Dex. The dashboard manages custom purchasable roles only; it does not expose currency, eligibility thresholds, or built-in item editing. Robberies are available anytime and legacy steal-window rows are cleanup-only.
Before you start:
- Docker Desktop (or Docker Engine) must be installed and running.
- Docker tests prove the rules, limits and race conditions. They cannot prove real Discord behaviour (permission overwrites, rate limits, button rendering, pins). The manual checklist this prompt creates covers that, so run both.
- The Docker database is plain Postgres, not Supabase. If a migration depends on a Supabase-only feature, Copilot will list it in the report.
- If a test fails, paste docs/economy/TEST_REPORT.md back to me and I will go through it with you.

```
Read docs/economy/ECONOMY_DESIGN.md and docs/economy/AUDIT.md first. Scan the existing test setup, Dockerfiles, docker-compose files, GitHub workflows and reuse their framework and helpers. If the project already uses Testcontainers, use it instead of compose and tell me. Do not change any economy rule. Only add tests, test helpers, Docker files, scripts and docs. If a test finds a bug, fix the bug in the smallest way and tell me.

SAFETY (applies to everything below)
- Tests run only against Docker containers on this computer. They must NEVER read or touch the normal DATABASE_URL, REDIS_URL, or any real Discord token.
- Before any test starts, a guard must refuse to run unless TEST_DATABASE_URL points to localhost or 127.0.0.1 on port 5433, TEST_REDIS_URL points to localhost on port 6380, and NODE_ENV is not production. If the guard refuses, it prints the reason.
- No test-only commands, backdoors or special modes in the bot code. Time control and the fake Discord layer live only in test files and test helpers.

PART 0: Docker test environment
1. Create docker-compose.test.yml (or add a "test" profile to the existing compose file) with:
   - PostgreSQL, same major version as production (check AUDIT.md; if unsure, say so and pick the closest). Fake database name, user and password that exist only in this file. Host port 5433. Data in tmpfs so every run starts empty.
   - Redis, same major version as production. Host port 6380, no persistence, maxmemory-policy noeviction (BullMQ needs this).
   - Healthchecks on both so tests start only when they are ready.
   - Both bound to 127.0.0.1 only.
2. Create .env.test.example (committed) with TEST_DATABASE_URL, TEST_REDIS_URL and fake values for every other required env variable, including a fake Discord token. Add .env.test to .gitignore. Tests must work with only fake values because Discord is faked.
3. Add scripts to the backend package.json:
   - economy:test:up: start the containers and wait until healthy.
   - economy:test:migrate: run the project's real migrations against the Docker database.
   - economy:test:run: run all economy tests and write docs/economy/TEST_REPORT.md.
   - economy:test:down: stop and remove containers and volumes.
   - economy:test: one command that does up, migrate, run, and then ALWAYS down (even when tests fail) and exits with the test result code.
4. Isolation: truncate all economy tables and flush Redis between scenarios, or use a fresh schema per scenario. Pick the faster safe option and explain it. Scenarios must never share data.
5. If any migration only works on Supabase (Supabase-only schemas or extensions), do not hide it. List it in the report and add the smallest test-only setup so the real migrations still run. Do not change the real migrations.
6. CI: add a GitHub Actions job (follow the existing workflow style, do not touch CodeQL) that runs economy:test using the same Docker setup or service containers, on pull requests that touch economy code. No secrets needed.
7. Optional "manual" profile in the compose file that starts only Postgres and Redis for manual testing with a real but separate TEST Discord bot token kept in .env.test (never committed). Document how to run the bot locally against it and clearly say which token and which private test server to use so production is never touched.

PART 1: Test helpers
1. A clock helper so tests can set "now" in any time zone, including Asia/Kathmandu and one time zone with daylight saving. Use it through the existing time helpers, not by patching global Date in app code.
2. A fake Discord layer: fake guild, members (with account age and join time), roles, channels, and a fake message queue that records every message the economy would send (rules, panel, store, leaderboard, robbing instructions, heist log, announcements) together with the mention settings of each message.
3. A seed helper that creates 8 test users: alice, bob, carol, dave, erin (normal members), newbie (account 2 days old), leaver (leaves the server), staff (has Manage Server). Every scenario starts from a clean database.

PART 2: Automated scenarios
These are integration tests that call the real services and command handlers against the Docker database. For every scenario assert the exact result, that no balance is ever below zero, and that every balance change has a transactions row.

Setup
1. /economy on by staff: category and 6 public channels created in the right order, regular member messages blocked, slash commands restricted to economy-commands, default store seeded with 11 items, and rules embeds posted. Run it again: nothing duplicated. Delete a channel and a message, run again: only those are recreated. Run as a non-staff user: refused. Run with the bot missing a permission: nothing created and the missing permission is listed. Migration coverage verifies legacy floors are raised to 50, default Rob More rows are disabled, and custom rows are preserved.

Daily reward
2. alice claims twice in one day: second refused. Claims Sunday to Saturday pay 50, 55, 60, 65, 70, 75, 80. Skip a day: back to 50. A new week starts at 50 again. 20 simultaneous /reward calls for bob: exactly one succeeds. A successful claim posts a persistent public announcement with the amount and streak. newbie is refused with the eligibility message.

Shop
3. Buy each default item with enough Dex and with too little. Buy a role item twice: no charge the second time. Force role assignment to fail: Dex returned. Shield cannot be stacked. Robbingusertool costs 400 Dex by default. Custom Title strips mentions and links and rejects more than 20 characters. Try to sell a role with Administrator: refused. Bounty: Dex held in escrow, min and max enforced, cannot target yourself.

Gifts
4. Send limit 100 and receive limit 200 per week, floor respected, available regardless of legacy window rows, blocked for newbie, both sides logged.

Robbing
5. `/robuser` without a Robbingusertool clearly directs the member to `/shop` or `#store`, even if they are also not old enough yet. An eligible member with a tool-less wallet gets the same guidance; once they own a tool, ineligible users see the account-age/server-membership requirements. Buy a tool and rob a target successfully: balances transfer, a heist log is queued, and the tool is consumed.
6. A second attempt without a new tool is refused. Buy another tool and rob the same target again: allowed, subject only to target eligibility and floor.
7. A protected target is refused. A victim at 70 Dex loses 10 and ends at 60; a victim at 58 loses 8 and ends at exactly 50.
8. A robbery never transfers more than 200 Dex, including with a legacy Rob More effect, and never leaves the victim below 50 Dex. A consumed tool cannot be used for a second successful robbery.
9. Shield blocks with the generic refusal and uses a charge; a successful Lockpick bypass consumes the appropriate effect. A Decoy stops the attempt without consuming the robber's tool, and another robber can try the target. Lockpick does NOT bypass a Decoy.
10. Self, bot, and leaver targets are refused. Eligibility rules are enforced.
11. Bounty: carol puts 100 Dex on bob, then alice successfully robs bob and receives the bounty. The announcements feed identifies alice, the bounty amount and bob, but never carol. A bounty that is never claimed remains held in escrow; there is no automatic window-close refund.
12. 50 concurrent attempts contend on wallet/effect locks: no duplicate balance transfer or item consumption.
13. Change the steal amount in settings between attempts: the next attempt uses the current setting.
14. Restart simulation with legacy scheduled/open window rows: startup closes them and does not reopen a window or block gifts/robbery.

Leaderboard
16. Exactly top 10, correct order, ties handled, bots and the leaver excluded, message edited only when something changed.

Safety and admin
17. /economy pause blocks every member command and button but not staff commands. /economy give, take and reset are logged with the staff ID. Commands outside economy-commands are refused privately with a link.
17a. A regular member cannot send messages in any economy channel or run an application command outside economy-commands. Private economy interaction replies expire after 60 seconds; persistent bot messages and reward announcements remain.
18. For every message the economy sent during all tests, assert it cannot ping @everyone, @here, a role or an unintended user.
19. At the end of each scenario, total Dex in wallets equals the sum of all transactions. Robbery and gifting never create or destroy Dex.
20. 100 parallel mixed calls (/reward, /buy, /gift, /robuser): no negative balance, no duplicate rewards, no duplicate transfers, and no repeated consumption of one tool.

PART 3: Report
Make economy:test print a short table (scenario number, name, pass or fail, reason for failures) and save the same table to docs/economy/TEST_REPORT.md together with the run time, the Postgres and Redis versions used, and anything that could not be tested.

PART 4: Docs
1. docs/economy/TESTING.md: how to install Docker, every command above, the ports used, how to reset, common errors (port already in use, Docker not running, migration failure) and how to read TEST_REPORT.md.
2. docs/economy/MANUAL_TEST.md: a numbered checklist in plain language for a human with 3 accounts (owner, tester1, tester2) in a private test server, using the separate test bot token. Each line has the exact step and the expected result:
   - Invite the test bot with the needed permissions, run /economy on, check the 6 channels, the pinned panel, the store buttons, rules text and pinned robbing instructions.
   - Use tester accounts that already meet the configured account-age and server-membership eligibility requirements; those thresholds are not exposed in the dashboard.
   - /reward on both testers, check /balance and the leaderboard after the next hourly refresh (and how to force a refresh if the project has one).
   - Buy a Robbingusertool, Shield, Decoy and a role. Verify the tool is consumed only after a successful robbery.
   - Tester1 robs tester2, check heist-log and the updated balances; buy a new tool to rob again.
   - Delete a channel and a message on purpose and run /economy on again.
   - /economy pause, try a command, /economy resume, /economy off.
   - Check the audit log and the transactions table for every step.
   - What to look for in the server logs and in Sentry after the test.
3. Update the .github/skills project overview file (if it exists) with the economy test commands.

FINISH
Run economy:test and show me: the result table, how long it took, anything that could not run in Docker and why, every bug you found and fixed, and every file created or changed.
```