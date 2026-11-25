# Dex Bot X: Economy Module Design (v2)

This document describes the current economy behavior. The original project audit and Copilot prompts are historical planning records; use this design, `OPERATIONS.md`, and current source code for the implemented behavior.

## 0. What changed in v2

- Full rules and guide channel text added (section 13), written in simple words.
- Owners can enable the economy two ways: the dashboard toggle or the `/economy on` command. Both call the same setup service.
- The default store is created automatically and remains available in Discord. The dashboard does not expose built-in item editing; it manages custom purchasable server roles.
- Default cosmetic roles are created by the bot itself (no permissions, safe). Owners can still add their own role items by hand.
- Robbing is available at any time and requires one Robbingusertool per successful robbery.
- Weekly resets no longer need a job. Streaks and gift limits use a week key, so a missed reset can never break anything.
- Robbing settings are read for each attempt; no steal-window scheduler is used.
- Currency is fixed to Dex. The dashboard keeps enable/status/pause controls and custom server-role management rather than economy tuning fields.
- A victim with only a few Dex above the floor is now protected instead of losing 1 Dex. Nobody wastes a steal on a 1-Dex target.
- Daily Boost now adds a flat bonus instead of replacing the amount, so it works with the streak.
- Robbery items take effect immediately and use charges instead of window timers.
- Gifts are always available, with weekly send and receive limits.
- Roles with dangerous permissions can never be sold (no override).
- A full anti-exploit table was added (section 8) and settings have hard minimum and maximum values (section 11).

## 1. Overview

Server owners enable the economy from the dashboard or with `/economy on`. The bot creates a public Dex Economy category with its channels. Members can send messages, use application commands, and add reactions in `economy-commands` and `store`; the other four channels are read-only. Economy slash-command handling remains restricted to `economy-commands`. Members earn daily Dex, spend it in a store, compete on a permanent leaderboard, and can rob one another any time by buying a Robbingusertool.

All Dex amounts are whole numbers. No decimals anywhere.

## 2. Core Rules

### 2a. Daily reward and streak

- Command: `/reward`. One claim per calendar day in the server time zone (not per rolling 24 hours).
- The week runs Sunday to Saturday. Reward is 50 on the first claimed day and grows by 5 for each consecutive day: 50, 55, 60, 65, 70, 75, 80.
- Missing a day drops the streak back to day 1 (50 Dex) on the next claim. No grace day.
- A new week always starts the streak again at day 1, even if the member claimed every day.
- Successful claims are announced publicly in `economy-commands` with the amount and current streak; no private success confirmation is left behind.
- Reward values and the default Asia/Kathmandu time zone remain stored settings, but are no longer editable in the dashboard.
- Implementation rule: store the claim as a local date string (for example 2026-11-23) per member, with a unique index on guild + user + date. This makes a double claim impossible even with two clicks at the same moment.
- Week key: the local date of the most recent Sunday, as a string. A wallet whose stored weekKey is not the current one is treated as streak 0 and weekly gift totals 0. No reset job is needed.

### 2b. Robbing

- `/robuser` works any time the economy is enabled and not paused.
- A Robbingusertool costs 400 Dex by default and is required for every successful robbery.
- One tool is consumed only when Dex is successfully transferred. Protected targets, Shields, Decoys, and other unsuccessful attempts do not consume it.
- There is no weekly window, per-window attempt limit, or per-window limit on robbing the same target. Members can buy another tool and try again.
- Default robbery amount: 200 Dex per successful robbery. Backend settings may lower the amount, and no setting or legacy Rob More effect can raise it above 200 Dex. Economy tuning fields are not exposed in the dashboard.
- No self-steal, no stealing from bots, no stealing from members who left the server.
- The thief picks the victim with the slash command user picker. No typing of names, so there is no wrong-person mistake.
- Amount, floor, and eligibility settings apply to each robbery attempt.

### 2c. Floor and protection

- Floor: a victim can never be pushed below 50 Dex (setting: protectionThreshold; minimum configurable value: 50).
- A member is robbable only when balance is at least floor + minimum steal (default minimum steal 5). So with the defaults, a member with 54 Dex or fewer is fully protected. This replaces the old rule where a 51-Dex victim lost 1 Dex.
- Amount taken = the smaller of the full amount and (victim balance minus floor).
- Protection messages are always the same generic text: "That member cannot be robbed right now." The bot never says whether the reason is low balance, a Shield or anything else. This stops people from scanning who has a Shield.

### 2d. Eligibility (anti-alt rules)

- Account age minimum: 7 days (setting).
- Time in server minimum: 24 hours (setting).
- These apply to `/reward`, `/robuser` and `/gift`. A member who does not meet them gets a clear message saying when they will be eligible.

## 3. Shop

The Discord store includes the built-in catalog and custom role listings. From the dashboard, owners add server roles and stage price or availability changes to existing custom role listings. Built-in items are not editable there.

### 3a. How items work

- Buying an item puts it in the member's items and effects apply immediately.
- A Robbingusertool is one-use and consumed only after a successful robbery.
- Shield blocks two robbery attempts and cannot be bought again while charges remain.
- Lockpick bypasses one Shield charge on a successful robbery; Decoy stops one attempt without consuming the robber's tool. Previously purchased Rob More effects remain supported for compatibility but cannot raise a robbery above 200 Dex.
- Bounty Poster places a reward that is paid when someone other than the buyer successfully robs the target. It is not tied to a window.
- Daily Boost and Custom Title and role items can be bought any time.
- Items that are not used up are not refunded. Bounty funds stay in escrow until claimed.

### 3b. Default store (created automatically)

If the owner never edits the store, this is what members see. Prices are chosen so that one full week of daily rewards (455 Dex) can buy about one power item, and roles take weeks. This also removes Dex from the economy so it does not inflate.

| Item | Default price | Effect | Duration |
| --- | --- | --- | --- |
| Robbingusertool | 400 Dex | Enables one successful robbery of up to 200 Dex; consumed only after a successful transfer | One success |
| Decoy | 90 Dex | Stops one attempt without consuming the robber's tool | One attempt |
| Shield | 150 Dex | Blocks two robbery attempts | Two charges |
| Daily Boost | 150 Dex | +25 Dex on every daily reward | 7 days |
| Lockpick | 180 Dex | Bypass one Shield charge on a successful robbery. Does not bypass a Decoy. | One success |
| Custom Title | 250 Dex | Short title shown next to your name on the leaderboard | Permanent |
| Bronze Member | 400 Dex | Cosmetic role | Permanent |
| Silver Member | 1,000 Dex | Cosmetic role | Permanent |
| Gold Member | 2,000 Dex | Cosmetic role | Permanent |
| Diamond Member | 4,000 Dex | Cosmetic role | Permanent |
| Bounty Poster | buyer sets 50 to 500 Dex | Reward paid to someone other than the buyer when they successfully rob the chosen target. Dex is held until claimed. | Until claimed |

The Discord store groups listings into Robbing, Protection, Daily & style, Server roles, and More items, with an item emoji, formatted price, and concise effect description. Purchase buttons follow those groups; a select menu is used when the buttons would exceed Discord's five action-row limit or the store has more than 20 items.

Default roles:

- Created by the bot when the economy is first enabled. Names above, a colour each, no permissions, not hoisted, not mentionable.
- Because the bot creates them, they sit below the bot's own role and can always be given out.
- Marked as default items. If the owner deletes a default item, it is not recreated later (a "defaults seeded" flag is stored).
- If a default role is deleted from Discord, the item is disabled automatically and the dashboard shows a warning.

### 3c. Role items added by the owner

- Nothing is automatic. The owner picks a safe role by hand and sets its Dex price. The dashboard supplies its listing description and supports enabling, disabling or deleting the custom role item.
- The picker lists only roles below the bot's own role.
- Roles with any of these permissions can never be sold, with no confirm step and no override: Administrator, Manage Server, Manage Roles, Manage Channels, Manage Webhooks, Ban Members, Kick Members, Moderate Members, Manage Messages, Mention Everyone. Unsafe roles are unavailable in the picker.
- If an item is removed later, members who already bought the role keep it. Only the store listing disappears.
- Purchase order: check the member does not already own the role (no charge if they do), take Dex inside a database transaction, assign the role, and if assigning fails, refund the Dex and log it. A member can never lose Dex without getting the role.

### 3d. Custom Title rules

- Maximum 20 characters. Mentions, links and invite links are removed. Run through the existing auto-moderation word filter if the bot has one.
- Custom Title remains a built-in Discord store item; the dashboard does not expose its built-in item toggle.
- All bot messages use "no mentions allowed" so a title like @everyone can never ping anyone.

## 4. Gifting

- Command: `/gift user amount`.
- Send limit: 100 Dex per week per member. Receive limit: 200 Dex per week per member. Both are settings.
- A gift cannot take the sender below the floor (setting, on by default).
- Gifts are always available, subject to the weekly limits and protection floor.
- Both people must meet the eligibility rules in 2d.
- Every gift is written to transactions with both sides.

## 5. Streak and Announcements Feed

### 5a. Announcements feed

- The economy-announcements channel (read-only) is a general feed, separate from the heist log. Robberies stay in the heist log by default; the owner may mirror them here.
- Always shown with amounts: gifts (sender, receiver, Dex).
- When a bounty is successfully placed, announce its amount and target without identifying the buyer; disable mention notifications.
- When a bounty is claimed, announce the claimant, bounty amount and robbed target; do not identify the buyer.
- Shown: role purchases, Custom Titles, streak milestones such as a seven-day streak.
- Always hidden: Shield, Daily Boost, Lockpick, Decoy and Bounty purchases, so nobody can tell who is protected or boosted.
- The dashboard does not expose announcement-event tuning controls.

### 5b. Robbing information

- One pinned message in economy-announcements explains that `/robuser` is available any time and that a Robbingusertool is required.
- The bot edits the same message during setup/repair. The message ID remains stored in the legacy `countdownMessageId` column for compatibility.

## 6. Channels (created by the bot)

The bot creates everything itself. The owner never has to create a channel or a category.

Layout, top to bottom, under the economy category:

1. economy-announcements: read-only general feed and pinned robbing instructions.
2. economy-rules: read-only guide for new members (full text in section 13).
3. leaderboard: read-only. One permanent embed with exactly the top 10 richest members. Edited in place every hour, only when something changed. No pages, no buttons.
4. economy-commands: commands run here. Has a pinned panel with buttons: My Balance, Claim Daily, Shop. Other button replies are ephemeral; a successful daily claim is announced publicly here.
5. store: members can browse the permanent categorized embed and use its purchase controls.
6. heist-log: read-only. Robbery results and staff-approved economy events.

Channel permissions:

| Channel | Everyone can | Everyone cannot | Bot needs |
| --- | --- | --- | --- |
| Category defaults; economy-commands, store | View, read history, send messages, use application commands, add reactions | All other channel permissions | View, read history, Send, Embed Links, Manage Messages (pin) |
| economy-announcements, economy-rules, leaderboard, heist-log | View, read history | Send messages, use application commands, add reactions, and all other channel permissions | View, read history, Send, Embed Links, Manage Messages (pin) |

The category grants @everyone the five listed permissions and explicitly denies its other channel permissions. `economy-commands` and `store` inherit those category permissions. The four read-only channels override the category to allow only viewing and reading history. Re-running `/economy on` repairs the category and channel overwrites and restores the requested channel order. Economy slash-command handling remains restricted to `economy-commands`; buttons and select menus in bot messages remain usable in read-only channels because they are interactions, not messages.

The bot stores every channel ID and message ID in economy_settings. If any channel or message is deleted, the bot detects it (on the next hourly refresh or on the next `/economy on`) and recreates only the missing piece, never duplicates.

## 7. Commands

Economy commands are slash commands. Each one works only in economy-commands. Anywhere else the bot answers privately: "Please use this in #economy-commands" with a link to the channel.

Member commands:

| Command | What it does |
| --- | --- |
| /reward | Claim today's daily Dex and see your streak |
| /balance | Your Dex, rank, streak, active items and steal stats |
| /shop | Show the store |
| /store | Alias for /shop |
| /buy item | Buy an item by name (with autocomplete) |
| /robuser user | Try to rob a member. Requires a Robbingusertool and works any time. |
| /gift user amount | Send Dex to someone |
| /leaderboard | Show the top 10 and your own rank privately |
| /economy help | Short guide and a link to economy-rules |

Owner commands (need Manage Server, default permission set on the command itself and checked again in code):

| Command | What it does |
| --- | --- |
| /economy on | Turn the economy on. Creates the category, channels, panel, store, default items, rules and robbing information. Running it again repairs anything missing. |
| /economy off | Turn the economy off. Stops commands and clears legacy scheduled jobs. Keeps all data and channels. |
| /economy pause | Kill switch. Instantly blocks all economy commands and buttons (owner and staff commands still work). |
| /economy resume | Undo pause. |
| /economy status | Show on/off, paused, channel links and number of members with a wallet. |
| /economy give user amount | Add Dex. Logged with the staff member's ID. |
| /economy take user amount | Remove Dex. Logged. |
| /economy reset user | Reset one member's wallet after a confirm button. Logged. |

### /economy on flow

1. Check the user has Manage Server. If not, reply privately and stop.
2. Check the bot has the permissions it needs (View Channels, Manage Channels, Manage Roles, Send Messages, Embed Links, Manage Messages, Read Message History). If something is missing, list exactly what, and stop. Nothing is half-created.
3. Defer the reply (Discord requires an answer in 3 seconds).
4. Call the same EconomySetupService the dashboard uses. A per-server lock (Redis) stops two enables at once, for example a dashboard click and a command together.
5. Create or repair: category, channels with permissions, default items and roles (only the first time), panel message, store message, leaderboard message, rules messages, robbing information.
6. Reply privately with a short summary and links to the channels.

## 8. Anti-Exploit Rules

| Possible exploit | Defence |
| --- | --- |
| Double click or two commands at once to duplicate Dex | Every balance change runs in one database transaction using conditional updates (balance must stay at or above the amount being taken). Unique indexes back the rules that matter. Database CHECK: balance is never below 0. |
| Claiming the daily reward twice | Unique index on guild + user + local date. |
| Concurrent robbery attempts | Wallet row locks serialize balance and inventory updates inside the same transaction. |
| Negative, zero, decimal or huge amounts | Integers only. Every input is validated with a minimum and maximum before it touches the database. |
| Alt accounts farming daily rewards and gifting to a main | Account age and server age minimums, gift send and receive caps. |
| Buying protection after seeing a robbery | Tool inventory and effects are checked/consumed atomically with the robbery; a tool is consumed only on success. |
| Dodging a steal by leaving and rejoining | Members who left cannot be robbed and are hidden from the leaderboard. Their wallet is kept. |
| Scanning who has a Shield or low Dex | Generic refusal message, and refused attempts do not appear in any log. |
| Buying a powerful role | Dangerous permissions block a role from being sold at all. |
| Paying for a role that fails to assign | Charge and role assignment are one unit. On failure the Dex is returned. |
| Mention injection through titles or names | All bot messages disable mention parsing. Only the optional victim ping is allowed, and only for that one user. |
| Bounty cycling between alts | Bounty Dex is held in escrow at purchase. Min and max bounty, one active bounty per target, cannot target yourself. The buyer cannot collect it either. |
| Time zone and daylight saving mistakes | Time zones are IANA names. Use a date library for all local-time maths. Streak and week logic use local date strings, not "24 hours later". |
| Bot restart or crash during an operation | Wallet, inventory, and transaction changes commit atomically; legacy window jobs are drained without reopening windows. |
| Heist log flooding or Discord rate limits | Posts go through a per-channel queue with a delay between messages. |
| Slow replies causing "interaction failed" | Defer first, work after. |
| Command spam | Per-user cooldown (3 seconds) and per-server steal rate limit. |
| Dashboard abuse | Existing login and Manage Server check, input validation with hard limits, every change written to an audit log. |
| Economy bug found in production | /economy pause and the dashboard kill switch stop everything instantly. |
| Owner or staff mistakes | give, take and reset are logged with who did it. |
| Wrong channel use | Commands work only in economy-commands. |
| Deleted channel or message | Detected and recreated by repair, no duplicates. |
| Inflation | Daily reward is the only source of new Dex. Store prices act as a sink. Stealing only moves Dex. |

## 9. Robbery transaction

After target and member validation, `/robuser` does a read-only prerequisite check: an already-processed interaction is reported first, then a missing Robbingusertool. This lets members without a tool see where to buy one even if they also have not met the age requirements. After that, eligibility is checked; the wallet transaction repeats the attempt/tool checks authoritatively to handle races.

1. Refuse self-targets, bots, missing members and leavers.
2. Verify the thief meets the eligibility rules (2d); the reply includes the configured account-age and server-membership thresholds.
3. In the transaction, lock both wallets, reject a duplicate attempt, and verify the thief still owns a Robbingusertool.
4. Refuse a protected target or an active Shield without a Lockpick. Unsuccessful attempts do not consume the tool.
5. A Decoy stops the attempt and is consumed, but the robber keeps their tool.
6. On success, transfer up to the configured amount while preserving the victim's floor. Consume one Robbingusertool and applicable one-use effects. Claim an active bounty for a successful robber other than its buyer.
7. Insert the attempt and transaction records. After commit, queue the heist-log message and optional victim ping.

Each successful robbery consumes one tool. There is no per-window cap or per-window target limit. Wallet locks prevent simultaneous uses from consuming one tool more than once.

## 10. Background work

- The steal-window scheduler is retired. Startup and economy setup close legacy open/scheduled records and remove pending legacy queue jobs.
- The worker continues hourly economy message repair and consumes any legacy jobs without reopening windows.
- No weekly reset job is needed. Daily rewards and weekly gift limits use local date/week keys (section 2a).

## 11. Settings and Limits

Numeric settings have defaults and hard minimums/maximums; the backend rejects values outside those ranges. Currency is always Dex, including when legacy settings are read.

| Setting | Default | Allowed range |
| --- | --- | --- |
| currencyName | Dex | Fixed; API updates normalize saved legacy names to Dex |
| economyName | Dex Economy | 1–32 letters/digits/spaces/hyphens |
| dailyAmount | 50 | 10 to 500 |
| streakStep | 5 | 0 to 50 |
| streakCapDays | 7 | 1 to 7 |
| dailyBoostBonus | 25 | 0 to 100 |
| stealAmount | 200 | 1 to 200 |
| minSteal | 5 | 1 to stealAmount |
| protectionThreshold (floor) | 50 | 50 to 1000 |
| weeklyGiftSendLimit | 100 | 0 to 1000 |
| weeklyGiftReceiveLimit | 200 | 0 to 2000 |
| minAccountAgeDays | 7 | 0 to 365 |
| minServerHours | 24 | 0 to 720 |
| item price | see 3b | 1 to 1,000,000 |
| bounty min / max | 50 / 500 | 10 to 5000 |
| commandCooldownSeconds | 3 | 1 to 60 |

## 12. Database Schema

Use the project's Drizzle schema and SQL migrations. All Dex amount columns are integers.

### economy_settings (one per server)

- guildId (unique), enabled, paused
- categoryId, rulesChannelId, commandsChannelId, leaderboardChannelId, storeChannelId, heistLogChannelId, announcementsChannelId
- panelMessageId, storeMessageId, leaderboardMessageId, countdownMessageId, rulesMessageIds (list), rulesHash
- defaultsSeeded (boolean)
- all settings from section 11, including currencyName, economyName and timezone
- heistAnnounceChannelId (null means use heist-log), pingVictim, announcement event toggles
- createdAt, updatedAt

### wallets (one per member per server)

- guildId, userId (unique together), balance (CHECK balance >= 0)
- lastDailyDate (local date string), streakDay, weekKey, weeklyGiftSent, weeklyGiftReceived
- customTitle
- totalEarned, totalStolen, totalLost
- leftServer (boolean), createdAt, updatedAt

### wallet_effects (active items and consumable inventory rows)

- guildId, userId, type (rob_tool, shield, legacy rob_more, lockpick, decoy, daily_boost), remainingWindows (charge count for robbery effects), expiresAt, createdAt

### shop_items

- guildId, itemId, kind (rob_tool, shield, rob_more, lockpick, decoy, bounty, daily_boost, custom_title, role), name, description, price, roleId (only for role), stock (optional), enabled, isDefault, sortOrder

### daily_claims

- guildId, userId, localDate. Unique on all three. This is the real double-claim guard.

### steal_windows (legacy history; no new windows are scheduled)

- guildId, windowId, opensAt, closesAt (UTC), status (scheduled, open, closed), lateOpen (boolean)
- rules snapshot (steal amount, max steals, floor, min steal, bounty limits)
- totalStolen, summary posted flag

### steal_log

- guildId, windowId (attempt ID for new robberies), thiefId, victimId, kind (steal or decoy), amount, bountyPaid, timestamp
- The legacy unique index on windowId + victimId remains; each new attempt uses a unique interaction ID.

### bounties

- guildId, windowId (null until the window opens), buyerId, targetId, amount (held), status (active, claimed, refunded), claimedBy, createdAt

### transactions

- guildId, userId, type (daily, steal, lost, purchase, gift_sent, gift_received, bounty_hold, bounty_paid, bounty_refund, refund, admin_give, admin_take, admin_reset), amount, otherUserId, actorId, note, timestamp

### economy_audit_log

- guildId, actorId, source (dashboard or command), action, before, after, timestamp

## 13. economy-rules Channel Text

Written in simple words. The bot builds these embeds from the server's economy settings. When a setting changes, the bot edits the embeds only if their content changed. The messages are sent in this order and the bot stores their IDs in rulesMessageIds. Text in { } is replaced by the real setting.

### Embed 1: Start here

Welcome to the economy of {serverName}.

You earn Dex every day. You can spend Dex in the store. You can rob other members any time, but you need a Robbingusertool for each successful robbery.

How to start (3 steps):
1. Go to #economy-commands.
2. Type /reward to get your daily Dex.
3. Type /balance to see how much Dex you have.

Want to buy something? Open #store and press the Buy button under an item. You can also type /shop.

Important: all economy commands only work in #economy-commands. If you type one somewhere else, the bot will tell you privately where to go.

### Embed 2: All commands

/reward: get your daily Dex. Once per day.
/balance: see your Dex, rank, streak and active items.
/shop: see everything you can buy.
/buy: buy an item. Start typing the item name and pick it from the list.
/robuser: try to rob a member. Pick a member from the list. Requires a Robbingusertool for a successful robbery.
/gift: send Dex to someone. Pick the member, then type the amount.
/leaderboard: see the top 10 and your own rank (only you can see this).
/economy help: show this guide in short.

Buttons in #economy-commands:
My Balance shows your Dex and Shop opens the store with private replies. A successful Claim Daily is announced publicly in #economy-commands with the amount and streak.

### Embed 3: Daily Dex and streaks

Use /reward once every day. The day changes at midnight in {timezone}.
Successful claims are announced publicly in #economy-commands with the amount and streak. The claim does not leave a private success confirmation.

Day 1 of the week gives {dailyAmount} Dex. Each day in a row gives {streakStep} Dex more, up to {maxDailyAmount} Dex on day {streakCapDays}.

The week runs Sunday to Saturday. If you miss a day, your streak starts again at {dailyAmount}. On Sunday a new week starts and everyone starts at day 1 again.

Example: claim Sunday, Monday and Tuesday and you get {dailyAmount}, then {dailyAmountPlus1}, then {dailyAmountPlus2}.

### Embed 4: Robbing

You can use /robuser any time. Buy a Robbingusertool from the store for {robToolPrice} Dex before you try. One tool is consumed when Dex is successfully transferred; unsuccessful attempts do not consume it.

How to rob: type /robuser and pick a member. If it works, you take up to {stealAmount} Dex from them, capped at 200 Dex. The result appears in #heist-log.

The rules:
- There is no weekly window or per-window attempt/target limit. Buy another tool for another successful robbery.
- Nobody can lose Dex below 50 Dex (or the higher configured protection threshold). Members close to that amount cannot be robbed at all.
- You cannot steal from yourself or from bots.
- If the bot says "That member cannot be robbed right now", pick someone else. That try does not count.
- Shields and Decoys can stop you. A failed attempt does not consume your Robbingusertool.
- New accounts and new members must wait {minAccountAgeDays} days and {minServerHours} hours before they can use economy commands.

Want to stay safe? Spend your Dex or buy a Shield or Decoy from the store.

### Embed 5: The store

Open #store, or type /shop or /store. Press Buy under an item, or type /buy and the item name.

{the bot lists every enabled store item here with its price and a one-line meaning, in the same order as the store. For the default store this means:}
Robbingusertool: required for one successful robbery of up to 200 Dex; costs 400 Dex by default.
Shield: blocks two robbery attempts.
Lockpick: bypasses one Shield charge on a successful robbery. It does not work against a Decoy.
Decoy: stops one robbery attempt without consuming the robber's tool.
Bounty Poster: you pick a target and a reward. Another member who successfully robs that target gets the reward. The held Dex stays in escrow until claimed.
Daily Boost: +{dailyBoostBonus} Dex on every daily reward for 7 days.
Custom Title: a short title next to your name on the leaderboard.
Roles (Bronze, Silver, Gold, Diamond): cosmetic roles you keep forever.

Robbery items take effect immediately and are consumed by their defined success/charge rules.

### Embed 6: Gifts, fair play and questions

Gifts: use /gift to send Dex. You can send up to {weeklyGiftSendLimit} Dex and receive up to {weeklyGiftReceiveLimit} Dex per week. Gifts are always available, subject to eligibility and weekly limits.

Fair play:
- One person, one account. Using extra accounts to collect Dex can get you removed from the economy.
- Staff can add, remove or reset Dex if something goes wrong. Every change is recorded.

Common questions:
Why did my command not work? Check you are in #economy-commands and meet the eligibility rules.
Why can't I rob someone? You may need a Robbingusertool, or the target may be protected by their balance, a Shield, or a Decoy.
Where did my Dex go after a robbery? Check #heist-log.
How do I see my rank? Use /balance or /leaderboard.
What if I have a problem? Ask a staff member. They can see a full history of your Dex.

## 14. Dashboard Flow

1. Owner opens the Economy section for their server.
2. Toggles Enable economy. The bot runs the same setup as `/economy on` and shows the result (channels created, anything missing, bot permission problems).
3. The dashboard keeps economy status, pause/resume and the channel cleanup action; currency is fixed to Dex and economy tuning fields are not exposed.
4. Store: built-in default items remain available in Discord but are not shown as editable dashboard items. The dashboard adds and manages only custom purchasable server roles; new listings and price/availability changes are staged with Save changes and Discard, and the safe role picker adds roles at an individual Dex price.
5. Disabling stops commands and clears legacy scheduled jobs. Data and channels are kept. A separate "Delete economy channels" action needs a confirm and never deletes wallet data.
6. Follow the dashboard's existing design, colors and components, and avoid unrelated changes to existing pages or the admin panel.

## 15. Edge Cases

- Owner deletes a channel by hand: repair recreates only that channel and its message. IDs are updated.
- Bot role is moved below a shop role: purchase fails safely, Dex is refunded, dashboard warns.
- Member leaves: kept in the database, hidden from steals and leaderboard, wallet restored if they return.
- Server time zone changed by the owner: applies to date-based rewards/gift limits and future local date calculations.
- Bot is removed from the server: economy is marked off. Data kept for 30 days, then the existing server cleanup rules apply.
- Two shards: setup locks and wallet transactions must remain safe across shards (the audit confirms how sharding works).
- Interaction retried by Discord: the transaction and unique indexes make a repeated request harmless.

## 16. Build Order

1. Audit the project and save the result.
2. Database schema, migrations and the wallet service with atomic balance changes.
3. EconomySetupService, `/economy` commands, channel creation and default store.
4. Message builders: rules, panel, store, leaderboard and static robbing information.
5. Member commands and buttons: reward, balance, shop/store, buy, robuser, gift, leaderboard.
6. Member commands and atomic wallet/effect transactions, including `/robuser`.
7. Dashboard backend endpoints and Economy page.
8. Hardening: tests for every rule in section 8, security review, docs and sync check.
