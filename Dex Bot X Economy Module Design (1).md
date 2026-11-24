# Dex Bot X: Economy Module Design (v2)

This document describes the economy module added on top of the existing production bot. It reuses the existing database, dashboard auth, command handler and scheduler. Where the project audit (docs/economy/AUDIT.md) finds that the real stack differs from what is written here, follow the audit and keep the rules in this document.

## 0. What changed in v2

- Full rules and guide channel text added (section 13), written in simple words.
- Owners can enable the economy two ways: the dashboard toggle or the `/economy on` command. Both call the same setup service.
- A default store is created automatically. Owners can leave it as it is, or edit, disable and delete anything.
- Default cosmetic roles are created by the bot itself (no permissions, safe). Owners can still add their own role items by hand.
- Steal logic rewritten as an ordered list of checks, with clear rules for which failed attempts cost the thief a steal and which do not.
- Weekly resets no longer need a job. Streaks and gift limits use a week key, so a missed reset can never break anything.
- Rules are frozen into the steal window when it opens, so changing settings mid-window cannot be abused.
- A victim with only a few coins above the floor is now treated as protected instead of losing 1 coin. Nobody wastes a steal on a 1-coin target.
- Daily Boost now adds a flat bonus instead of replacing the amount, so it works with the streak.
- Items and shop purchases that change steal outcomes are locked while a steal window is open.
- Gifts are disabled during the steal window and there is a weekly receive limit as well as a send limit.
- Roles with dangerous permissions can never be sold (no override).
- Late start: if the bot comes back during a window, it opens the window late instead of skipping the whole week.
- A full anti-exploit table was added (section 8) and settings have hard minimum and maximum values (section 11).

## 1. Overview

Server owners enable the economy from the dashboard or with `/economy on`. The bot creates an Economy category with its channels. Members earn daily coins, spend them in a store, compete on a permanent leaderboard, and every Sunday during a one-hour window they can steal coins from each other.

All coin amounts are whole numbers. No decimals anywhere.

## 2. Core Rules

### 2a. Daily reward and streak

- Command: `/reward`. One claim per calendar day in the server time zone (not per rolling 24 hours).
- The week runs Sunday to Saturday. Reward is 50 on the first claimed day and grows by 5 for each consecutive day: 50, 55, 60, 65, 70, 75, 80.
- Missing a day drops the streak back to day 1 (50 coins) on the next claim. No grace day.
- A new week always starts the streak again at day 1, even if the member claimed every day.
- Base amount, step and streak cap are dashboard settings.
- Default time zone is Asia/Kathmandu. Owners can change it to any IANA time zone.
- Implementation rule: store the claim as a local date string (for example 2026-11-23) per member, with a unique index on guild + user + date. This makes a double claim impossible even with two clicks at the same moment.
- Week key: the local date of the most recent Sunday, as a string. A wallet whose stored weekKey is not the current one is treated as streak 0 and weekly gift totals 0. No reset job is needed.

### 2b. Steal window

- Default: Sundays, 4:00 PM to 5:00 PM in the server time zone. Day, start time and length (15 to 180 minutes) are settings.
- Outside the window `/robuser` is disabled and replies with the relative time until the next window opens.
- Steal amount: 10 coins per victim (20 with Rob More).
- A victim can be robbed only once per window.
- A thief can attempt at most 10 victims per window (setting). Successful steals and Decoy hits both count. Refused attempts (protected, shielded, already robbed) do not count.
- No self-steal, no stealing from bots, no stealing from members who left the server.
- The thief picks the victim with the slash command user picker. No typing of names, so there is no wrong-person mistake.
- Rules are copied into the window record when it opens (amounts, limits, thresholds). Changing settings during a window applies from the next window.

### 2c. Floor and protection

- Floor: a victim can never be pushed below 50 coins (setting: protectionThreshold).
- A member is robbable only when balance is at least floor + minimum steal (default minimum steal 5). So with the defaults, a member with 54 coins or fewer is fully protected. This replaces the old rule where a 51-coin victim lost 1 coin.
- Amount taken = the smaller of the full amount and (victim balance minus floor).
- Protection messages are always the same generic text: "That member cannot be robbed right now." The bot never says whether the reason is low balance, a Shield or anything else. This stops people from scanning who has a Shield.

### 2d. Eligibility (anti-alt rules)

- Account age minimum: 7 days (setting).
- Time in server minimum: 24 hours (setting).
- These apply to `/reward`, `/robuser` and `/gift`. A member who does not meet them gets a clear message saying when they will be eligible.

## 3. Shop

Owners add, edit, disable and delete items from the dashboard. All prices, durations and amounts are settings.

### 3a. How items work

- Buying an item puts it in the member's items. It becomes active at the next steal window open and ends at that window's close.
- Shield lasts two windows (it uses up one charge at each window close, whether or not anyone tried to rob the member). It cannot be bought again while charges remain.
- Items that affect steals (Shield, Rob More, Lockpick, Decoy, Bounty Poster) cannot be bought while a steal window is open. The shop shows these as "available after the window".
- Daily Boost and Custom Title and role items can be bought any time.
- Items that are not used up are not refunded, except the Bounty Poster rule below.

### 3b. Default store (created automatically)

If the owner never edits the store, this is what members see. Prices are chosen so that one full week of daily rewards (455 coins) can buy about one power item, and roles take weeks. This also removes coins from the economy so it does not inflate.

| Item | Default price | Effect | Duration |
| --- | --- | --- | --- |
| Shield | 150 | Cannot be robbed | Next 2 windows |
| Rob More | 120 | Each steal takes 20 instead of 10 (still limited by the floor) | Next window |
| Lockpick | 180 | Steal through a Shield. Does not bypass a Decoy. | Next window |
| Decoy | 90 | First thief who targets you wastes one steal and gets nothing | Next window |
| Bounty Poster | buyer sets 50 to 500 | Reward paid to whoever robs the chosen target next. Coins are held when you buy. Refunded in full if nobody robs the target before the window closes. | Next window |
| Daily Boost | 150 | +25 coins on every daily reward | 7 days |
| Custom Title | 250 | Short title shown next to your name on the leaderboard | Permanent |
| Bronze Member | 500 | Cosmetic role | Permanent |
| Silver Member | 1200 | Cosmetic role | Permanent |
| Gold Member | 2500 | Cosmetic role | Permanent |
| Diamond Member | 5000 | Cosmetic role | Permanent |

Default roles:

- Created by the bot when the economy is first enabled. Names above, a colour each, no permissions, not hoisted, not mentionable.
- Because the bot creates them, they sit below the bot's own role and can always be given out.
- Marked as default items. If the owner deletes a default item, it is not recreated later (a "defaults seeded" flag is stored).
- If a default role is deleted from Discord, the item is disabled automatically and the dashboard shows a warning.

### 3c. Role items added by the owner

- Nothing is automatic. The owner picks each role by hand with a price, optional description and an enabled toggle.
- The picker lists only roles below the bot's own role.
- Roles with any of these permissions can never be sold, with no confirm step and no override: Administrator, Manage Server, Manage Roles, Manage Channels, Manage Webhooks, Ban Members, Kick Members, Moderate Members, Manage Messages, Mention Everyone. The dashboard shows why a role is greyed out.
- If an item is removed later, members who already bought the role keep it. Only the store listing disappears.
- Purchase order: check the member does not already own the role (no charge if they do), take the coins inside a database transaction, assign the role, and if assigning fails, give the coins back and log it. A member can never lose coins without getting the role.

### 3d. Custom Title rules

- Maximum 20 characters. Mentions, links and invite links are removed. Run through the existing auto-moderation word filter if the bot has one.
- Owners can toggle the Custom Title item off.
- All bot messages use "no mentions allowed" so a title like @everyone can never ping anyone.

## 4. Gifting

- Command: `/gift user amount`.
- Send limit: 100 coins per week per member. Receive limit: 200 coins per week per member. Both are settings.
- A gift cannot take the sender below the floor (setting, on by default).
- Gifts are disabled while a steal window is open. This stops moving coins to a friend to dodge a steal.
- Both people must meet the eligibility rules in 2d.
- Every gift is written to transactions with both sides.

## 5. Streak and Announcements Feed

### 5a. Announcements feed

- The economy-announcements channel (read-only) is a general feed, separate from the heist log. Robberies stay in the heist log by default; the owner may mirror them here.
- Always shown with amounts: gifts (sender, receiver, coins).
- Shown: role purchases, Custom Titles, streak milestones such as a seven-day streak.
- Always hidden: Shield, Rob More, Daily Boost, Lockpick, Decoy and Bounty purchases, so nobody can tell who is protected or boosted.
- Owners can toggle each visible event type in the dashboard.

### 5b. Steal window countdown

- One pinned message in economy-announcements shows a live countdown using Discord's native timestamp format, so every member sees their own local time.
- Closed: "Next steal window opens <t:...:R>". Open: "Steal window closes <t:...:R>".
- The bot edits the same message at open and at close. The message ID is stored as countdownMessageId. If the message is deleted, the bot reposts and pins a new one.

## 6. Channels (created by the bot)

The bot creates everything itself. The owner never has to create a channel or a category.

Layout, top to bottom, under a category named Economy:

1. economy-rules: read-only guide for new members (full text in section 13).
2. economy-commands: the only channel where economy commands run. Has a pinned panel with buttons: My Balance, Claim Daily, Shop. Button replies are ephemeral.
3. leaderboard: read-only. One permanent embed with exactly the top 10 richest members. Edited in place every hour, only when something changed. No pages, no buttons.
4. store: read-only. One permanent embed listing every enabled item with its price, and a Buy button under each (a select menu if there are more than 20 items).
5. heist-log: read-only. Every steal, window open and close banners, and an end-of-window summary.
6. economy-announcements: read-only general feed and the pinned countdown.

Channel permissions:

| Channel | Everyone can | Everyone cannot | Bot needs |
| --- | --- | --- | --- |
| economy-rules, leaderboard, store, heist-log, economy-announcements | View, read history | Send messages, add reactions, create threads | View, Send, Embed Links, Manage Messages (pin) |
| economy-commands | View, send, use application commands | Mention everyone | View, Send, Embed Links |

Buttons and select menus still work in read-only channels because they are interactions, not messages.

The bot stores every channel ID and message ID in economy_settings. If any channel or message is deleted, the bot detects it (on the next hourly refresh or on the next `/economy on`) and recreates only the missing piece, never duplicates.

## 7. Commands

Economy commands are slash commands. Each one works only in economy-commands. Anywhere else the bot answers privately: "Please use this in #economy-commands" with a link to the channel.

Member commands:

| Command | What it does |
| --- | --- |
| /reward | Claim today's daily coins and see your streak |
| /balance | Your coins, rank, streak, active items and steal stats |
| /shop | Show the store |
| /buy item | Buy an item by name (with autocomplete) |
| /robuser user | Try to rob a member. Only during the steal window. |
| /gift user amount | Send coins to someone |
| /leaderboard | Show the top 10 and your own rank privately |
| /economy help | Short guide and a link to economy-rules |

Owner commands (need Manage Server, default permission set on the command itself and checked again in code):

| Command | What it does |
| --- | --- |
| /economy on | Turn the economy on. Creates the category, channels, panel, store, default items, rules and countdown. Running it again repairs anything missing. |
| /economy off | Turn the economy off. Stops commands and the scheduler. Keeps all data and channels. |
| /economy pause | Kill switch. Instantly blocks all economy commands and buttons (owner and staff commands still work). |
| /economy resume | Undo pause. |
| /economy status | Show on/off, paused, channel links, next steal window, number of members with a wallet. |
| /economy give user amount | Add coins. Logged with the staff member's ID. |
| /economy take user amount | Remove coins. Logged. |
| /economy reset user | Reset one member's wallet after a confirm button. Logged. |

### /economy on flow

1. Check the user has Manage Server. If not, reply privately and stop.
2. Check the bot has the permissions it needs (View Channels, Manage Channels, Manage Roles, Send Messages, Embed Links, Manage Messages, Read Message History). If something is missing, list exactly what, and stop. Nothing is half-created.
3. Defer the reply (Discord requires an answer in 3 seconds).
4. Call the same EconomySetupService the dashboard uses. A per-server lock (Redis) stops two enables at once, for example a dashboard click and a command together.
5. Create or repair: category, channels with permissions, default items and roles (only the first time), panel message, store message, leaderboard message, rules messages, countdown message.
6. Reply privately with a short summary and links to the channels.

## 8. Anti-Exploit Rules

| Possible exploit | Defence |
| --- | --- |
| Double click or two commands at once to duplicate coins | Every balance change runs in one database transaction using conditional updates (balance must stay at or above the amount being taken). Unique indexes back the rules that matter. Database CHECK: balance is never below 0. |
| Claiming the daily reward twice | Unique index on guild + user + local date. |
| Two thieves robbing the same victim at the same moment | Unique index on window + victim for successful steals, inside the same transaction. |
| Negative, zero, decimal or huge amounts | Integers only. Every input is validated with a minimum and maximum before it touches the database. |
| Alt accounts farming daily rewards and gifting to a main | Account age and server age minimums, gift send and receive caps, gifts blocked during the window. |
| Buying protection after seeing a robbery | Steal-related items cannot be bought while a window is open. |
| Changing settings in the middle of a window | Rules are copied into the window when it opens. |
| Dodging a steal by leaving and rejoining | Members who left cannot be robbed and are hidden from the leaderboard. Their wallet is kept. |
| Scanning who has a Shield or low coins | Generic refusal message, and refused attempts do not appear in any log. |
| Buying a powerful role | Dangerous permissions block a role from being sold at all. |
| Paying for a role that fails to assign | Charge and role assignment are one unit. On failure the coins are returned. |
| Mention injection through titles or names | All bot messages disable mention parsing. Only the optional victim ping is allowed, and only for that one user. |
| Bounty cycling between alts | Bounty coins are held in escrow at purchase. Min and max bounty, one active bounty per target, cannot target yourself. The buyer cannot collect it either. |
| Time zone and daylight saving mistakes | Time zones are IANA names. Use a date library for all local-time maths. Streak and week logic use local date strings, not "24 hours later". |
| Bot restart or crash during a window | Window state lives in the database. On start, the bot reconciles: if a window should be open it opens late, if it should have closed it closes and settles. |
| Heist log flooding or Discord rate limits | Posts go through a per-channel queue with a delay between messages. |
| Slow replies causing "interaction failed" | Defer first, work after. |
| Command spam | Per-user cooldown (3 seconds) and per-server steal rate limit. |
| Dashboard abuse | Existing login and Manage Server check, input validation with hard limits, every change written to an audit log. |
| Economy bug found in production | /economy pause and the dashboard kill switch stop everything instantly. |
| Owner or staff mistakes | give, take and reset are logged with who did it. |
| Wrong channel use | Commands work only in economy-commands. |
| Deleted channel or message | Detected and recreated by repair, no duplicates. |
| Inflation | Daily reward is the only source of new coins. Store prices act as a sink. Stealing only moves coins. |

## 9. Steal Logic

One database transaction per `/robuser`. Checks run in this order. Each check says whether a refused attempt costs the thief one of their steals.

1. Economy is on and not paused, and a window is open for this server. Refuse. Costs nothing.
2. Thief meets the eligibility rules (2d). Refuse. Costs nothing.
3. Target is a real member, still in the server, not a bot, not the thief. Refuse. Costs nothing.
4. Thief has not used all their steals for this window. Refuse. Costs nothing.
5. Victim is robbable (balance at least floor + minimum steal). If not, generic refusal. Costs nothing.
6. Victim has not already been robbed in this window. Refuse. Costs nothing.
7. Victim has a Shield and thief has no Lockpick: generic refusal. Costs nothing.
8. Victim has an active Decoy: the Decoy is used up, the thief gets nothing and the attempt counts as one of their steals. This happens even if the thief has a Lockpick. A decoy hit does not mark the victim as robbed, so the victim can still be robbed by a different thief.
9. Steal: amount = the smaller of (steal amount, or double with Rob More) and (victim balance minus floor). Move the coins. Insert the steal record and transactions. If an active Bounty exists on the victim, pay it to the thief from escrow and mark it claimed.
10. After commit: queue the heist-log embed. Optional victim ping if enabled.

Total a victim can lose in one window: one steal, at most 20 coins (with the defaults).

## 10. Scheduler

Use the project's existing job system (BullMQ with Redis if the audit confirms it). Do not run an every-minute loop over every server.

- Window open and close: when the economy is turned on or a window closes, compute the next open and close times in the server time zone and schedule two delayed jobs for that server. Window state is saved in the database.
- At open: create the window record with a copy of the rules, post the open banner, edit the countdown message.
- At close: close the window, use up one Shield charge for members who had one, refund unclaimed bounties, expire Rob More, Lockpick and Decoy, post the summary (total stolen, top thief, most-robbed victim), edit the countdown message, schedule the next window.
- Hourly: refresh each leaderboard by editing the same message, only when balances changed. Cache the top 10 query and index balance.
- On bot start: reconcile every enabled server. If a window should be open and has no record, open it late and close it at the original end time. If a window ended while the bot was offline, close and settle it. Never open a window that has already ended.
- No weekly reset job. The week key handles it (section 2a).
- Hosting note: if the bot runs on a free host that goes to sleep, it will miss windows. The bot must be online during the Sunday window. A free uptime check that pings the backend every few minutes is a common fix, but the audit should confirm how the project runs.

## 11. Settings and Limits

Every setting has a default and a hard minimum and maximum. The backend rejects anything outside them, so an owner can never set values that break the economy.

| Setting | Default | Allowed range |
| --- | --- | --- |
| dailyAmount | 50 | 10 to 500 |
| streakStep | 5 | 0 to 50 |
| streakCapDays | 7 | 1 to 7 |
| dailyBoostBonus | 25 | 0 to 100 |
| stealAmount | 10 | 1 to 100 |
| minSteal | 5 | 1 to stealAmount |
| maxStealsPerWindow | 10 | 1 to 25 |
| protectionThreshold (floor) | 50 | 0 to 1000 |
| stealWindowMinutes | 60 | 15 to 180 |
| weeklyGiftSendLimit | 100 | 0 to 1000 |
| weeklyGiftReceiveLimit | 200 | 0 to 2000 |
| minAccountAgeDays | 7 | 0 to 365 |
| minServerHours | 24 | 0 to 720 |
| item price | see 3b | 1 to 1,000,000 |
| bounty min / max | 50 / 500 | 10 to 5000 |
| commandCooldownSeconds | 3 | 1 to 60 |

## 12. Database Schema

Use the project's existing database tools (the audit decides the exact file locations and migration method). All coin columns are integers (use bigint if the audit says the project does).

### economy_settings (one per server)

- guildId (unique), enabled, paused
- categoryId, rulesChannelId, commandsChannelId, leaderboardChannelId, storeChannelId, heistLogChannelId, announcementsChannelId
- panelMessageId, storeMessageId, leaderboardMessageId, countdownMessageId, rulesMessageIds (list), rulesHash
- defaultsSeeded (boolean)
- all settings from section 11, plus stealDay, stealStart (local time), timezone
- heistAnnounceChannelId (null means use heist-log), pingVictim, announcement event toggles
- createdAt, updatedAt

### wallets (one per member per server)

- guildId, userId (unique together), balance (CHECK balance >= 0)
- lastDailyDate (local date string), streakDay, weekKey, weeklyGiftSent, weeklyGiftReceived
- customTitle
- totalEarned, totalStolen, totalLost
- leftServer (boolean), createdAt, updatedAt

### wallet_effects (active items, one row per effect)

- guildId, userId, type (shield, rob_more, lockpick, decoy, daily_boost), remainingWindows, expiresAt, createdAt

### shop_items

- guildId, itemId, kind (shield, rob_more, lockpick, decoy, bounty, daily_boost, custom_title, role), name, description, price, roleId (only for role), stock (optional), enabled, isDefault, sortOrder

### daily_claims

- guildId, userId, localDate. Unique on all three. This is the real double-claim guard.

### steal_windows (one per server per window)

- guildId, windowId, opensAt, closesAt (UTC), status (scheduled, open, closed), lateOpen (boolean)
- rules snapshot (steal amount, max steals, floor, min steal, bounty limits)
- totalStolen, summary posted flag

### steal_log

- guildId, windowId, thiefId, victimId, kind (steal or decoy), amount, bountyPaid, timestamp
- Unique index on windowId + victimId where kind is steal.
- The steal count per thief is the number of rows for windowId + thiefId.

### bounties

- guildId, windowId (null until the window opens), buyerId, targetId, amount (held), status (active, claimed, refunded), claimedBy, createdAt

### transactions

- guildId, userId, type (daily, steal, lost, purchase, gift_sent, gift_received, bounty_hold, bounty_paid, bounty_refund, refund, admin_give, admin_take, admin_reset), amount, otherUserId, actorId, note, timestamp

### economy_audit_log

- guildId, actorId, source (dashboard or command), action, before, after, timestamp

## 13. economy-rules Channel Text

Written in simple words. The bot builds these embeds from the server's settings, so numbers always match the dashboard. When an owner changes a setting, the bot edits the embeds (it compares a hash of the text first and only edits when something changed). The messages are sent in this order and the bot stores their IDs in rulesMessageIds. Text in { } is replaced by the real setting.

### Embed 1: Start here

Welcome to the economy of {serverName}.

You earn coins every day. You can spend coins in the store. Once a week there is a short window where you can steal coins from other members, and they can steal from you.

How to start (3 steps):
1. Go to #economy-commands.
2. Type /reward to get your daily coins.
3. Type /balance to see how many coins you have.

Want to buy something? Open #store and press the Buy button under an item. You can also type /shop.

Important: all economy commands only work in #economy-commands. If you type one somewhere else, the bot will tell you privately where to go.

### Embed 2: All commands

/reward: get your daily coins. Once per day.
/balance: see your coins, rank, streak and active items.
/shop: see everything you can buy.
/buy: buy an item. Start typing the item name and pick it from the list.
/robuser: try to rob a member. Pick a member from the list. Only works during the steal window.
/gift: send coins to someone. Pick the member, then type the amount.
/leaderboard: see the top 10 and your own rank (only you can see this).
/economy help: show this guide in short.

Buttons in #economy-commands:
My Balance shows your coins. Claim Daily gets your daily coins. Shop opens the store. Only you can see the replies.

### Embed 3: Daily coins and streaks

Use /reward once every day. The day changes at midnight in {timezone}.

Day 1 of the week gives {dailyAmount} coins. Each day in a row gives {streakStep} more, up to {maxDailyAmount} coins on day {streakCapDays}.

The week runs Sunday to Saturday. If you miss a day, your streak starts again at {dailyAmount}. On Sunday a new week starts and everyone starts at day 1 again.

Example: claim Sunday, Monday and Tuesday and you get {dailyAmount}, then {dailyAmountPlus1}, then {dailyAmountPlus2}.

### Embed 4: The steal window

Once a week, on {stealDay} from {stealStart} to {stealEnd} ({timezone}), you can steal coins. Check the countdown pinned in #economy-announcements.

How to steal: type /robuser and pick a member. If it works, you take up to {stealAmount} coins from them. The result appears in #heist-log.

The rules:
- You can try up to {maxStealsPerWindow} different members in one window.
- Each member can only be robbed once per window.
- Nobody can lose coins below {protectionThreshold}. Members close to that amount cannot be robbed at all.
- You cannot steal from yourself or from bots.
- If the bot says "That member cannot be robbed right now", pick someone else. That try does not count.
- Decoys and some items can stop you. If you fall for a Decoy, you get nothing and that try counts.
- New accounts and new members must wait {minAccountAgeDays} days and {minServerHours} hours before they can use economy commands.

Want to stay safe? Spend your coins before the window, or buy a Shield from the store. Protection items cannot be bought while the window is open.

### Embed 5: The store

Open #store, or type /shop. Press Buy under an item, or type /buy and the item name.

{the bot lists every enabled store item here with its price and a one-line meaning, in the same order as the store. For the default store this means:}
Shield: you cannot be robbed during the next 2 windows.
Rob More: you steal {doubleStealAmount} instead of {stealAmount} in the next window.
Lockpick: you can steal from members who have a Shield in the next window. It does not work against a Decoy.
Decoy: the first thief who tries to rob you gets nothing and loses one of their tries.
Bounty Poster: you pick a target and a reward. Whoever robs that member next gets the reward. If nobody does, you get your coins back.
Daily Boost: +{dailyBoostBonus} coins on every daily reward for 7 days.
Custom Title: a short title next to your name on the leaderboard.
Roles (Bronze, Silver, Gold, Diamond): cosmetic roles you keep forever.

Items that affect stealing start at the next steal window and end when that window ends.

### Embed 6: Gifts, fair play and questions

Gifts: use /gift to send coins. You can send up to {weeklyGiftSendLimit} coins and receive up to {weeklyGiftReceiveLimit} coins per week. Gifts do not work during the steal window.

Fair play:
- One person, one account. Using extra accounts to collect coins can get you removed from the economy.
- Staff can add, remove or reset coins if something goes wrong. Every change is recorded.

Common questions:
Why did my command not work? Check you are in #economy-commands, and that it is not the steal window for gifts or shop items.
Why can't I steal from someone? They may have too few coins, a Shield, or someone already robbed them this window. The bot does not say which.
Where did my coins go after a robbery? Check #heist-log.
How do I see my rank? Use /balance or /leaderboard.
What if I have a problem? Ask a staff member. They can see a full history of your coins.

## 14. Dashboard Flow

1. Owner opens the Economy section for their server.
2. Toggles Enable economy. The bot runs the same setup as `/economy on` and shows the result (channels created, anything missing, bot permission problems).
3. Settings: daily amount, streak, steal amount, steal day and time, time zone, floor, steals per window, gift limits, eligibility rules. Values are validated against section 11.
4. Heist channel choice (default or custom), victim ping, which announcement events are shown.
5. Store: sees the default items. Can edit prices, rename, disable, delete or add items. Adding a role item uses the safe role picker.
6. Kill switch button (same as `/economy pause`).
7. Disabling stops the scheduler and commands. Data and channels are kept. A separate "Delete economy channels" action needs a confirm and never deletes wallet data.
8. Existing dashboard pages, the admin panel and existing logic must not change. Only the new Economy section is added and it must use the same design, colours and components as the rest of the site.

## 15. Edge Cases

- Owner deletes a channel by hand: repair recreates only that channel and its message. IDs are updated.
- Bot role is moved below a shop role: purchase fails safely, coins returned, dashboard warns.
- Member leaves: kept in the database, hidden from steals and leaderboard, wallet restored if they return.
- Server time zone changed by the owner: applies from the next window and the next local day.
- Bot is removed from the server: economy is marked off. Data kept for 30 days, then the existing server cleanup rules apply.
- Two shards: setup and window jobs must run on the shard that owns that server (the audit confirms how sharding works).
- Interaction retried by Discord: the transaction and unique indexes make a repeated request harmless.

## 16. Build Order

1. Audit the project and save the result.
2. Database schema, migrations and the wallet service with atomic balance changes.
3. EconomySetupService, `/economy` commands, channel creation and default store.
4. Message builders: rules, panel, store, leaderboard, countdown.
5. Member commands and buttons: reward, balance, shop, buy, robuser, gift, leaderboard.
6. Scheduler, steal window and `/robuser`.
7. Dashboard backend endpoints and Economy page.
8. Hardening: tests for every rule in section 8, security review, docs and sync check.
