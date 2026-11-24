# DexBotX Economy: Dex Currency and Store Prices

> Historical prompt archive: its implementation instructions below are superseded. Do not execute them as current requirements; see `ECONOMY_DESIGN.md` and `OPERATIONS.md` for implemented behavior.

## Names

- Currency name: **Dex**. Amounts are shown like "50 Dex", "1 Dex", "1,200 Dex". No "$" and no word "coins" anywhere members can see.
- Economy name: **Dex Economy**. Used for the category name and the headings in the rules channel.
- Currency is fixed to Dex. The dashboard does not expose currency or economy-name editing.

## Daily income (everything is priced from this)

Daily reward starts at 50 Dex and grows by 5 each day in a row: 50, 55, 60, 65, 70, 75, 80. A member who claims all 7 days earns 455 Dex per week, about 65 Dex per day on average.

## Default store prices

| Item | Price | Effect | Roughly how long to afford |
| --- | --- | --- | --- |
| Robbingusertool | 400 Dex | Required for one successful robbery of up to 200 Dex; consumed on success only. | about 1 week |
| Decoy | 90 Dex | Stops one attempt without consuming the robber's tool. | about 1.5 days |
| Shield | 150 Dex | Blocks two robbery attempts. | about 2.5 days |
| Daily Boost | 150 Dex | +25 Dex on every daily reward for 7 days. | about 2.5 days |
| Lockpick | 180 Dex | Bypass one Shield charge on a successful robbery. | about 3 days |
| Custom Title | 250 Dex | Short title next to your name on the leaderboard. Permanent. | about 4 days |
| Bronze Member (role) | 400 Dex | Cosmetic role. Permanent. | about 1 week |
| Silver Member (role) | 1,000 Dex | Cosmetic role. Permanent. | about 2 weeks |
| Gold Member (role) | 2,000 Dex | Cosmetic role. Permanent. | about 4.5 weeks |
| Diamond Member (role) | 4,000 Dex | Cosmetic role. Permanent. | about 9 weeks |
| Bounty Poster | you choose 50 to 500 Dex | Paid to another member who successfully robs your chosen target; unclaimed Dex remains in escrow. | n/a |

The four cosmetic roles are priced so the first role takes about a week and the top role about two months. Robbingusertool is a consumable purchase for each successful robbery. Owners can change item prices in the dashboard.

Other Dex amounts: minimum robbery floor 50 Dex, up to 200 Dex per successful robbery, gifts 100 Dex sent and 200 Dex received per week. There is no robbery window or per-window attempt/target limit.

## Prompt for Copilot

Paste this into Copilot. If you already pasted the design doc in your repo, this prompt also updates it.

```
Read docs/economy/ECONOMY_DESIGN.md and docs/economy/AUDIT.md first. We are renaming the economy currency to "Dex" and changing the default store prices. Scan the whole repo (backend and frontend) before changing anything, and reuse existing helpers. Do not change any economy rule or any non-economy code. This is a naming, display and default-values change only.

NAMES
- Currency name: "Dex". Always shown after the number, like "50 Dex", "1 Dex", "1,200 Dex". Same word for singular and plural. No "$" symbol and no word "coins" anywhere a member or owner can see.
- Economy name: "Dex Economy". Used for the Discord category name and for headings in the rules channel.

STEP 1: Find every place that needs changing. Search for: "coin", "coins", "$", "balance" wording, "wallet" wording, "economy" in user-facing strings, command and option descriptions, embed titles and fields, button labels, modal text, error and refusal messages, rules embeds, store embed, leaderboard embed, heist-log text, bounty announcements, dashboard labels and placeholders, docs, tests and test snapshots. List what you found grouped by file before you edit.

STEP 2: One source of truth
1. Add two economy settings: currencyName (default "Dex") and economyName (default "Dex Economy"). Add them to the settings constants and the shared validation schema with these rules: currencyName 1 to 12 characters, letters and digits only, no spaces, no mentions, no links; economyName 1 to 32 characters, letters, digits, spaces and hyphens only. Reject anything else on the backend. Add a migration if a new column is needed, with the defaults above, and show me the command to run it.
2. Add one helper formatCurrency(amount, settings) that returns the amount with thousands separators and the currency name, for example "1,200 Dex". Every message, embed, command reply, dashboard screen and log line that shows an amount must use it. There must be no hardcoded "coins" or "Dex" string in message text outside the settings defaults and this helper.
3. Put the helper and the types in the shared place AUDIT.md found, so the frontend and backend cannot drift.

STEP 3: Update the user-facing text
1. Replace every "coins" wording with the currency name from settings. Command and option descriptions can be static text, so use the default wording "Dex" there and "amount in Dex" for amount options.
2. Rules channel embeds: use {currency} and {economyName} placeholders filled from settings. Example: "You earn {dailyAmount} every day" becomes "You earn 50 Dex every day". Keep the rules hash logic so the embeds update when the owner changes the names.
3. Category name uses economyName. When the owner changes economyName in the dashboard, rename the Discord category and update the rules, store, leaderboard and static robbing instructions so everything stays in sync. Channel names stay as they are.
4. Dashboard: add currencyName and economyName fields to the Economy settings form with the same validation as the backend and a live preview line, for example "Example: 1,250 Dex". Use the existing design, no new fonts, no layout changes outside the Economy section.

STEP 4: New default store prices (seed values only)
Update the default store seed to exactly these prices:
- Robbingusertool 400, Decoy 90, Shield 150, Daily Boost 150, Lockpick 180, Custom Title 250
- Bronze Member 400, Silver Member 1000, Gold Member 2000, Diamond Member 4000
- Bounty Poster: buyer chooses, min 50, max 500
Keep every other default: daily 50 with a step of 5, floor 50, default rob amount 200 (hard maximum 200), gift send 100 and receive 200, Daily Boost +25 for 7 days. Robbing is anytime; a Robbingusertool is consumed only after a successful transfer.
Existing data: if the economy is not live on any real server yet, just change the seed. If it might already be live, add a safe update that changes a default item's price only when it is still marked isDefault and still has its old default price, and never touches items the owner edited or created. Tell me which case applies after checking.

STEP 5: Tests
1. Update every existing test and snapshot that mentions coins or old prices.
2. Add tests: formatCurrency (thousands separators, 0, 1, large numbers, custom currency name); currencyName and economyName validation (rejects spaces, mentions, links, empty, too long); a scan test that fails if the words "coins" or "$" appear in any member-facing text in the economy code; default store snapshot with the exact prices above; a sanity test that the full-week reward is 455 Dex and that the cheapest power item costs less than one full week of rewards and the most expensive role costs more than 8 weeks; anonymous bounty placement and claim announcements.
3. Run the Docker test command (economy:test) and show me the report.

STEP 6: Docs
Update docs/economy/ECONOMY_DESIGN.md (sections 3b, 11, 13 and any place that says coins), docs/economy/OPERATIONS.md, docs/economy/MANUAL_TEST.md and the .github/skills project overview if it exists. Add currencyName and economyName to the settings table.

FINISH
Give me: the list of every file changed, the migration command if any, whether existing data needed the safe price update, the test result, and any member-facing text you could not change and why.
```

## After Copilot finishes

In your test server, run `/economy on` and check three things: the category is named "Dex Economy", the rules channel says "Dex" everywhere, and `/shop` shows the prices from the table above.