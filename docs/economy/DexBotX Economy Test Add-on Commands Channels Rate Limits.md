# DexBotX Economy: Test Add-on (Commands, Channels, Rate Limits, Full Sweep)

> Historical test prompt. Its scheduled-window and dashboard-tuning requirements are superseded. For current behavior, use `ECONOMY_DESIGN.md` and `OPERATIONS.md`; legacy window cleanup may still be tested for compatibility.

Paste this together with the "Full Test and Exploit Hunt" prompt. It adds the checks you asked for and takes priority where the two overlap.

## What this changes in your design

- `/economy pause` (and `/economy resume`) is allowed only for members with the Administrator permission, or the server owner. Before, it was Manage Server. The reason for the code check is below.
- On `/economy on`, the bot reuses any category and channels that already exist and creates only what is missing. It looks for each one by its stored ID first, then by name inside the Economy category. It never makes a second copy.
- Every channel ID is stored in the database and every notification (store, leaderboard, heist log, announcements, countdown) is sent to the stored ID.
- The bot must never trigger a Discord rate limit in normal use.

Two Discord facts worth knowing:
- A slash command's default permission can only be set on the whole command, not on one sub-command. So the safest setup is: the entire `/economy` group defaults to Administrator, and the code also checks Administrator or owner on every run. The code check matters because a server owner can change who sees a command in Discord's own settings (Server Settings, Integrations), and that must not let a normal member pause the economy.
- Interactions (slash commands, buttons) are answered through Discord's interaction responses. You must answer within 3 seconds, so every command answers first (defer) and works afterwards.

## Prompt for Copilot

```
This is an add-on to the "Full Test and Exploit Hunt" prompt. Read docs/economy/ECONOMY_DESIGN.md, docs/economy/AUDIT.md, docs/economy/TESTING.md and the existing economy code and tests first, and reuse the existing Docker setup, fake Discord layer and credentials rules (never print secrets, test bot and test guild only, never production). Where this add-on conflicts with an earlier prompt, this add-on wins. If a test fails, fix the bug in the smallest way, add a test that proves the fix, and run again. Do not delete or weaken a test to make it pass. If a fix would change a design rule I did not ask for below, stop and ask me.

PART G: Slash commands in Discord, and admin-only pause
1. Registration check. Add a test and a live check that fetch the registered commands from Discord (REST) for the test guild or application and compare them with the command definitions in code: names, descriptions, option names, types, required flags, min and max values, autocomplete, and that every economy command is guild-only (not usable in DMs). Fail if a command is missing, extra, or different. Check the totals stay under Discord's limits (100 global slash commands, 25 options per command, 8000 characters of definition).
2. Registration behaviour. Commands must be registered with one bulk overwrite at deploy time, and only when the definitions actually changed (compare a hash). They must NOT be re-registered on every bot start, every shard start, or every /economy on. Add a test for that. (Discord limits how many commands can be created per day.)
3. Permissions. Change the /economy command group so its default_member_permissions is Administrator. Additionally, in code, every /economy sub-command must check that the user is the server owner or has Administrator, using the permissions Discord sends with the interaction, and refuse politely (ephemeral) otherwise. Do not rely on Discord's command visibility alone. Keep every other /economy rule as it is.
4. Test the permission matrix for /economy on, off, pause, resume, status, give, take and reset with each of: server owner, member with Administrator, member with only Manage Server, member with only Manage Roles, normal member, a member who has a role granted access through Discord's command permission overrides, and a fake interaction with missing or forged permission fields. Only the owner and Administrator may succeed. Every refusal is ephemeral and written to the audit log with the user ID (without spamming: one audit row per user per minute at most).
5. Pause behavior in current code: after `/economy pause`, member commands and economy buttons are blocked; `/economy resume` restores them. There is no active steal-window scheduler or countdown state; historical open/scheduled rows are cleanup-only. Test legacy-row cleanup separately.
6. Dashboard. The dashboard pause and resume buttons and endpoints must follow the same rule: only the server owner or a member with Administrator in that guild. Other dashboard settings keep the existing Manage Server rule. Add backend tests for a user with only Manage Server (blocked from pause) and for a user from another guild.
7. Update the design doc (sections 7 and 14), the rules and help text, MANUAL_TEST.md and the dashboard text so they all say pause is for Administrators.

PART H: Category and channels: reuse, create only what is missing, store IDs
1. Lookup order for the category and for each of the 6 channels (economy-rules, economy-commands, leaderboard, store, heist-log, economy-announcements), on /economy on, dashboard enable and the repair check:
   a. Use the stored ID if that channel still exists in the guild.
   b. If the stored ID is missing or deleted, look inside the Economy category (also found by stored ID first, then by exact name) for a channel of the right type with the expected name and adopt it, saving its ID.
   c. Only if nothing is found, create it. Never create a second copy. Never adopt a channel outside the Economy category.
2. Save each ID to the database right after that channel is created or adopted (not only at the end), so a crash halfway through setup can continue later without duplicates. Same for the message IDs (panel, store, leaderboard, countdown, rules).
3. If an owner renames a channel or moves it, the stored ID keeps working. If an owner picked a custom heist channel, notifications go there; if it is deleted or the bot lost access, fall back to the default heist-log and tell the owner once through the dashboard status and /economy status.
4. Every notification and update (store, leaderboard, heist log, announcements, countdown, rules, panel) must read the channel ID from the stored settings (with a short cache) and never search by name at send time.
5. When the economy is already set up, /economy on must make no create calls to Discord. Add a test with a request counter that proves zero create calls when everything exists, only the missing items created when something is missing, and a second run creates nothing.
6. Tests: first enable on an empty server (category plus 6 channels in order with correct permissions); enable again; delete one channel; delete the category; delete the stored settings row but leave the channels (they must be adopted, not duplicated); rename a channel; 5 simultaneous enables (dashboard and command at once, only one runs and none duplicates); a Discord error halfway through setup (resume without duplicates); bot missing Manage Channels (nothing half-created, the missing permission is listed); a channel with the same name outside the category (must be ignored).
7. Live check with the real test bot in the test guild (guarded as in the main prompt): run all of the above for real, fetch the channels and permission overwrites and compare them with the design doc, then clean up only what the script created.

PART I: Discord rate limit safety
Goal: the bot never gets rate limited by Discord in normal use, and if it does, it recovers without losing or repeating anything.
1. Build or extend a fake Discord HTTP server (a small service in the Docker test compose file) and point the real discord.js REST client at it using the REST api base URL option, so the real discord.js code paths run. It must record every request with time and route, send realistic rate limit headers, and be able to return 429, 500, 403 and 404 on demand.
2. Add a request-rate guard to the tests: the bot must stay under 40 requests per second overall, and per route it must respect the bucket headers. Fail any test where the bot sends a request that should have been delayed.
3. Rules to implement if missing, and prove with tests:
   - Verify heist log and announcements delivery follows the current queue and Discord rate-limit handling. Do not assume a steal-window burst or historical queue target without checking current code.
   - Leaderboard and rules and store updates: edit only when content changed, never more than one edit per message per minute, and stagger the hourly refresh across servers with a random delay so 1,000 servers do not all edit at the same second.
   - Channel and role creation during setup: one request at a time with a short pause, not in parallel. A full setup should take a few seconds and never burst.
   - Role assignment on purchase goes through a small queue; if Discord says wait, wait and retry, and the member gets a "your role is on the way" reply instead of an error. The charge and refund logic must still hold.
   - Never fetch members, channels or roles one by one in a loop. Use the cache, and batch fetches.
   - Pins: pin once, never re-pin on every refresh.
   - Command registration: see Part G.
   - Per-user command cooldown from settings so one user cannot spam the bot into a rate limit, and a per-server limit on /robuser and /buy bursts.
   - Interaction replies: always defer first, then edit the reply once. No multiple follow-up messages in a loop.
4. Rate limit simulation tests: make the fake server return 429 with retry-after on the heist-log channel while 50 steals happen. Check: no steal is lost, no message is posted twice, balances are right, the bot does not crash, and messages arrive in order after the wait. Do the same for role assignment, message edits and channel creation. Also 500 and timeouts.
5. Scale simulation: 500 fake servers with the economy on, an hourly refresh and concurrent economy activity. Measure total requests and peak requests per second and show they stay inside the limits above.
6. Live check on the real test server: listen to the discord.js rateLimited event for the whole live run (setup, repair, 30 queued messages, 20 edits). The live run FAILS if that event fires. Print the request count per route.

PART J: Full function sweep (test everything)
1. Make a list of every economy function, service method, command, sub-command, button, select menu, modal, autocomplete, scheduler job, queue worker and dashboard endpoint (the audit and the code show them). Save it as docs/economy/FUNCTION_MATRIX.md with a column for the test(s) that cover it and its result. Any item without a test gets a test now.
2. Turn on coverage reporting for the economy code. Target at least 90 percent branch coverage on the wallet service, steal logic, shop logic, gift logic, setup service, scheduler and permission checks, and show the numbers. Coverage is not proof, so keep the attack tests from the main prompt; report any code the tests could not reach and why.
3. Explicit scenario checks, each with exact numbers and invariants (no negative balance, total Dex adds up, every change has a transaction row, all amounts shown as "N Dex"):
   - Shopping: buy every default item (Robbingusertool, Shield, Lockpick, Decoy, Bounty Poster, Daily Boost, Custom Title, Bronze, Silver, Gold, Diamond) with enough and with too little Dex, twice, with the role assignment failing, with a deleted or disabled item, with the owner changing the price in between, and 100 buys at once with balance for one.
   - Transfers (/gift): send and receive limits, floor, availability at any time, newbie and alt rules, self-gift, bot target, member who left, amounts at the limits (limit, limit plus 1, 0, negative, decimal), and 100 gifts at once.
   - Robbing: the full list of rob scenarios from the main prompt, plus floor cases, the 200-Dex maximum with legacy Rob More effects, all Shield/Lockpick/Decoy combinations, one-success-per-tool, bounty payout, and legacy window rows.
   - Daily reward and streak, leaderboard, rules channel text, panel and store buttons, pinned robbing instructions, announcements feed (hidden items must never be announced), pause and resume, off and on again, settings changes (including currency and economy name), and dashboard enable, disable and item management.
   - Crash safety: garbage interaction payloads, missing settings row, missing channel, missing role, Redis down, Postgres paused, process killed mid-operation, two workers running the same job. No crash, no unhandled promise rejection, no stack trace shown to members, and the invariants hold after recovery.

PART K: Fix loop and final report
1. Run the whole suite. For every failure: find the cause, fix it in the smallest way, add or keep the test that proves the fix, run the whole suite again. Repeat until everything passes or until something needs my decision. Do not skip, delete or loosen tests to get green.
2. Update docs/economy/TEST_REPORT.md, SECURITY_TEST_REPORT.md, TRACEABILITY.md, FUNCTION_MATRIX.md, TESTING.md and MANUAL_TEST.md. In MANUAL_TEST.md list what only a human can check with a real account: seeing the commands in the Discord command list, who sees /economy, pressing the buttons, the look of each message, and an anytime robbery with 3 accounts.
3. Finish with: the result table, run time, request counts per route from the live check, whether any rate limit event fired, every bug found and fixed (with file names), every item that needs my decision, everything that could not be tested and why, and every file created or changed. Do not print any secret value anywhere.
```

## After Copilot finishes

- Open `docs/economy/FUNCTION_MATRIX.md` and `SECURITY_TEST_REPORT.md`. Paste the "needs my decision" items and any "exploitable" rows here and I will go through them with you.
- Do the manual pass with your own account in the test server: check that `/economy` shows only for Administrators, run `/economy on` twice, delete a channel and run it again, press the store buttons, and try `/economy pause` from a normal member account.
- Honest limit: the tests prove only the behavior covered by their environment. Discord's real limits can change, so keep the `rateLimited` log and Sentry alert on in production and review them after live feature use.
