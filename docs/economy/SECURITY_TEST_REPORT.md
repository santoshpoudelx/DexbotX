# Economy Security Test Report

Run date: 2026-11-24

This is a focused regression report, not completion of the full exploit-hunt matrix. Tests ran against the repository's isolated Docker Postgres/Redis environment or mocked Discord interactions. No live Discord API calls or credentials were used.

| ID | Attack tested | Expected result | Actual result | Status | Fix and proving test |
|---|---|---|---|---|---|
| GIFT-01 | Ten concurrent gifts from one wallet with a weekly send cap of 30 Dex | At most 30 Dex sent for the week | Exactly three 10-Dex gifts succeeded; the other attempts were rejected | Blocked | Wallet rows are locked in deterministic order before counter checks. `enforces weekly gift limits under concurrent transfers` |
| GIFT-02 | Concurrent gifts from two senders to one receiver with a weekly receive cap of 40 Dex | Receiver accepts at most 40 Dex for the week | Exactly four 10-Dex gifts succeeded | Blocked | Same row-locking fix serializes updates to the receiver counter. `enforces weekly gift limits under concurrent transfers` |
| PAUSE-01 | Trigger reward, shop and store-buy buttons while paused; use store select and custom-title modal while paused; use store select while disabled | Member actions are rejected without balance or store changes | Each tested interaction returned the paused/disabled response before performing the action | Blocked | Shared enabled/paused check on buttons, selects and economy purchase modals. `EconomyCommandService interaction guards` |
| RESET-01 | Submit a reset confirmation as an unauthorized user | Reject without consuming confirmation or changing the wallet | Rejected; Redis token was not consumed and no wallet update occurred | Blocked | Confirmation is bound to the requesting user and current owner/Administrator authorization is checked again. `rejects wallet-reset confirmations from an unauthorized user without consuming the token` |
| RESET-02 | Replay an authorized reset confirmation | First valid use may reset; later use must be rejected | First use succeeded and consumed the token; replay did not update the wallet | Blocked | Random confirmation token expires after five minutes and is atomically consumed with Redis `GETDEL`. `consumes an authorized wallet-reset confirmation exactly once` |

## Verification totals

- Economy Docker integration: 21 passed.
- Backend unit tests: 141 passed.
- Frontend tests: 71 passed.
- Full backend E2E: economy E2E passed; the API E2E suite has three unrelated failures documented in `TEST_REPORT.md`.
- Backend build/typecheck, frontend typecheck and targeted ESLint: passed.
- Randomized fuzz seeds: none; the fuzz matrix was not executed.

## Not tested

- Full attack list in `Full Test and Exploit Hunt.md`, including randomized supply invariants, broad input fuzzing, high-load/concurrency combinations and infrastructure fault injection.
- Live Discord setup/repair, permissions, messages, pins, role changes, slash commands or component interaction against a real guild. The bot-token preflight returned HTTP 401 before any guild request.
- The dashboard OAuth login completed in the browser, but loading the economy page hit Discord HTTP 429.
- Per-rule traceability across all design sections.

The ignored `local.testing.discord` file appears in Git history. Credential values were not printed or included in this report; the bot-token value was used only for the read-only identity preflight.
