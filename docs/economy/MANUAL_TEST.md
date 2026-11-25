# Economy Manual Test

Use three accounts in a private Discord server and a separate test bot token.

Slash commands are not published when the bot starts. From `backend/`, register them for the test server with `npm run commands:deploy -- --guild <test guild ID>`.

1. Invite the test bot with View Channels, Manage Channels, Manage Roles, Send Messages, Embed Links, Manage Messages and Read Message History.
2. Run `/economy on` as the server owner. Verify the **Dex Economy** category and channel order: `economy-announcements`, `economy-rules`, `leaderboard`, `economy-commands`, `store`, and `heist-log`.
3. Verify @everyone has View Channel, Read Message History, Send Messages, Use Application Commands, and Add Reactions at category level, with other channel permissions denied. Confirm `economy-commands` and `store` inherit those permissions; `economy-announcements`, `economy-rules`, `leaderboard`, and `heist-log` allow only viewing and reading history. Economy slash-command handling remains restricted to `economy-commands`; the bot can still post and update messages in all economy channels.
4. Verify the pinned Dex Economy panel, store embed, rules embeds, leaderboard embed and pinned robbing instructions. Amounts must always use **Dex**. Confirm persistent bot messages do not disappear.
5. Claim `/reward` on tester 1 and tester 2. Each successful claim should leave a public, persistent announcement in `economy-commands` showing the amount and streak; there should be no private success confirmation. Check a private `/balance` reply disappears after 60 seconds. Verify `/leaderboard`, and that `/store` shows the same items as `/shop`.
6. In the Economy dashboard, verify built-in items such as Shield and Decoy are not listed for editing. Add a role below the bot's highest role (including a role with powerful permissions) with a Dex price and verify the store message updates. Change the role price/availability and test both **Discard** and **Save changes**; the saved price should be charged when the role is purchased. Buy a Robbingusertool for 400 Dex, plus Shield, Decoy, Daily Boost and RandomDex in Discord. Try Custom Title and Bounty to verify their modal/target-selection flows complete.
7. Run `/robuser` without a Robbingusertool and verify it asks you to buy one. With a tool, rob tester 2 successfully and verify the transfer is at most 200 Dex, the victim retains at least 50 Dex, a `heist-log` entry is posted, and the tool is consumed.
8. Verify an unsuccessful attempt (for example a protected target, Shield or Decoy) does not consume the robber's tool. Buy another tool and rob the same target again to confirm there is no window or once-per-target restriction.
9. Verify a Bounty Poster holds the buyer's Dex in escrow and announces the amount and target in `economy-announcements` without naming or pinging the buyer. When another user successfully robs the target, verify the feed says who claimed the bounty, the bounty amount, and the robbed target—never the buyer. If it is not claimed, it remains held; there is no automatic window-close refund.
10. Delete one economy channel and one economy message, and make an existing economy channel private or move it. Run `/economy on` again and verify missing pieces are recreated, existing channels are returned to the category in the requested order, and all permissions are repaired.
11. Run `/economy pause`, try member commands and buttons, then run `/economy resume`.
12. Verify `/senddex` transfers the requested amount without applying `/gift` weekly limits or the protection floor. Verify `/get5kdex` grants 5,000 Dex only to the allowlisted testing account and rejects all other users, including other administrators.
13. Run `/economy off`. Verify commands stop while data and channels remain.
14. Review economy audit rows and transaction rows for every action.
15. Check bot logs and Sentry for setup permission failures, Discord 429s and interaction errors.
