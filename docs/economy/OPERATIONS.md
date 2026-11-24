# Economy Operations

The economy is opt-in. Currency is always **Dex**; the dashboard does not let owners rename it or tune economy settings.

## Enable

- Use `/economy on` or enable Economy from the guild dashboard.
- DexBotX creates or repairs the Economy category and six economy channels.
- Economy channels remain public. Regular member messages are blocked, and application commands are accepted only in `economy-commands`.
- Required bot permissions are View Channels, Manage Channels, Manage Roles, Send Messages, Embed Links, Manage Messages and Read Message History.
- Setup creates the default Discord store catalog and default cosmetic roles the first time. Existing data and channel IDs are kept.
- After applying economy migrations, run `/economy on` (or use dashboard Enable/repair) to refresh the Discord store and remove retired default items.

## Member-facing behavior

- Successful `/reward` claims are announced persistently in `economy-commands` with the amount and streak.
- Private economy interaction replies expire after 60 seconds. Persistent bot messages and public reward announcements do not.
- Slash commands outside `economy-commands` are refused privately with guidance to use the command channel.
- All amounts use Dex.

## Pause and resume

- `/economy pause` or the dashboard Pause control immediately blocks economy member commands and economy buttons.
- Owner `/economy` management commands and dashboard controls remain available.
- `/economy resume` or Resume restores member commands.

## Disable and delete channels

- `/economy off` or Disable economy stops member commands and clears legacy scheduled jobs. Wallets, transactions and audit rows remain.
- Delete economy channels only after an explicit dashboard confirmation. Wallets and transaction history are not deleted.

## Store and dashboard

- Built-in store items remain available in Discord and are not listed as editable dashboard items.
- The dashboard adds and manages custom purchasable server roles. Unsafe roles are excluded from the picker. New role listings and price/availability edits are staged until **Save changes**; **Discard** reverts all pending role changes.
- Economy tuning fields, currency naming and built-in item editing are not exposed in the dashboard.
- Robbing is available any time the economy is enabled and not paused. Every successful robbery requires and consumes one Robbingusertool (400 Dex by default); failed attempts preserve the tool. A robbery transfers at most 200 Dex, and the target retains at least 50 Dex.
- Migration `0011_robbing_tool_limits` disables default Rob More store items and raises existing configured protection floors below 50 Dex. Migration `0012_store_catalog_copy` refreshes only exact legacy descriptions on default items, preserving customized copy. Existing Rob More effects are grandfathered but cannot exceed the 200-Dex robbery cap.
- The window scheduler is retired. Startup and economy setup close legacy open/scheduled records and remove pending legacy queue jobs.

## Legacy window records

- Historical `steal_windows` rows are retained for compatibility, but no new windows are scheduled or opened.
- A legacy open/scheduled row is closed during cleanup; it does not gate robbing, gifts, or shop use.

## Bounty escrow

- An unclaimed bounty remains held in escrow because no window close/refund event remains to settle it.
- Only a different member who successfully robs the target can claim the bounty. Staff should account for unclaimed escrow when reviewing wallet totals.
- Placement announcements show the bounty amount and target, but never the buyer. A successful claim announces the robber, bounty amount and target, without exposing the buyer or pinging users.

## Audit and recovery

- Economy setup, settings, item and staff-wallet actions write economy audit rows.
- Use `/economy status` for enabled, paused and wallet status.
- Use `/economy give`, `/economy take` and `/economy reset` for logged staff corrections.
