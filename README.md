# Rush Bot

A Telegram bot with four parts:

1. **Rush drops** — limited-stock claim-fastest drops, now with **auto-expiry** and **scheduling**.
2. **Games** — 6 mini-games (Tic-Tac-Toe, Rock-Paper-Scissors, Chess Puzzle, Flag Quiz, Word Scramble,
   Memory Match). First win of each banks 1 point.
3. **Tasks + Gateway** — join-to-use gate (multiple Telegram channels + optional WhatsApp), plus a task
   checklist.
4. **Growth tools** — leaderboard, referral links, broadcast messaging, CSV exports, and anti-spam cooldowns.

## Verification: what's actually checkable vs. self-reported

- **Telegram channel membership is verified for real**, instantly, via `getChatMember` — no screenshots.
  Rechecked automatically every 10 minutes to catch anyone who leaves.
- **WhatsApp membership cannot be verified by any bot.** The gate's WhatsApp step is self-reported; the
  WhatsApp *task* (which awards a point) requires a screenshot forwarded to you for manual Approve/Reject.
- **Manual tasks and referral rewards have no fraud-proofing** — see "Known limitations" below.

Leave any feature's env var blank to disable it entirely.

## 1. Create the bot

1. [@BotFather](https://t.me/BotFather) → `/newbot` → copy the token into `BOT_TOKEN`.
2. Add the bot as **admin** to every Telegram channel you want verified (gateway channels, `channel_join` tasks).
3. For `ADMIN_REVIEW_CHAT_ID` (WhatsApp screenshot review): message the bot from your own account first, then
   get your numeric user ID from [@userinfobot](https://t.me/userinfobot).

## 2. Run locally

```bash
npm install
cp .env.example .env
npm start
```

Admin panel: http://localhost:3000 (basic-auth, `ADMIN_USER`/`ADMIN_PASSWORD`).

## 3. Feature guide

### Games
6 games live under "🎮 Play Games" in the bot menu. Each awards 1 point the first time it's won; replaying
afterwards is just for fun. `/me` and the "🏆 My Points" menu show progress out of 6.

### Gateway & Tasks
- `GATEWAY_CHANNELS=@chan1,@chan2` (comma-separated) — all required before anything else works.
- `WHATSAPP_GROUP_LINK` — adds a self-reported WhatsApp step to the gate.
- Admin panel → "New Task" to add checklist items (`channel_join`, `whatsapp_join`, `manual`, or `game`). Game tasks are linked to one of the six games and complete automatically when the user wins. Every task can have a configurable prize in points; the prize is credited automatically once per user/task after verified completion.

### Leaderboard
`/leaderboard` command or "📊 Leaderboard" menu button — top 10 by points. Full standings exportable as CSV
from the admin panel.

### Referrals
Each user's referral link is `t.me/<yourbot>?start=<their_user_id>` (shown via "🔗 My Referral Link" in the
menu). New users who start the bot through that link earn their referrer +1 point immediately.

### Scheduled & auto-expiring drops
On the "New Drop" form:
- **Expires after (minutes)** — the drop stops accepting claims automatically once time's up, and the
  channel message updates to show "⏰ EXPIRED".
- **Schedule for later** — pick a date/time and the bot posts it automatically when that time arrives,
  instead of you clicking "Post Now".
Both are checked every 30 seconds by a background sweep (see `src/index.js`).

### Broadcast
Admin panel → "📣 Broadcast" — sends a plain-text message to everyone who has ever started the bot. Sent
with a small delay between messages to stay under Telegram's rate limits; the panel reports how many
succeeded vs. failed (failures are almost always users who've blocked the bot).

### CSV export
- Per-drop claims: link on the claims panel after clicking a drop.
- Full leaderboard: link on the leaderboard card.

### Cooldown / anti-spam
Every button tap is throttled to one per 350ms per user (in-memory, no config needed) — stops rapid-fire
tapping on a rush drop from hammering the database. Legitimate use isn't affected; nobody taps faster than
that on purpose.

## Telegram rich-message formatting

Bot messages are sent using Telegram **HTML parse mode** throughout the user-facing bot, games, task flows, reviews, drops, and admin broadcasts. Supported formatting includes:

- **Bold:** `<b>text</b>`
- *Italic:* `<i>text</i>`
- Underline: `<u>text</u>`
- Strikethrough: `<s>text</s>`
- Inline code: `<code>text</code>`
- Code blocks: `<pre>code</pre>`
- Links: `<a href="https://example.com">Open</a>`
- Quotes: `<blockquote>text</blockquote>`

Dynamic values such as usernames, task names, drop titles, and game answers are HTML-escaped before being inserted into formatted messages.

The admin broadcast endpoint also uses HTML mode, so broadcast messages can contain Telegram HTML formatting.

## 4. Deploy to Railway

1. Push to GitHub → Railway → **New Project → Deploy from GitHub repo**.
2. Add every env var you're using under **Variables**.
3. **Add a Volume** mounted at `/app/data` and change the DB path in `src/db.js` to
   `path.join('/app/data', 'data.sqlite')` — otherwise points, claims, and tasks reset on every redeploy.
4. Generate a public domain under **Settings → Networking** for the admin panel.

## Project structure

```
rush-bot/
├── src/
│   ├── index.js          # entry point — bot, admin server, recheck + drop sweep timers
│   ├── bot.js              # all Telegram logic: gate, menus, games, tasks, drops, referrals
│   ├── tasks.js             # getChatMember verification + unfollow recheck sweep
│   ├── db.js                 # SQLite schema + all queries (users, drops, tasks, referrals...)
│   ├── games/
│   │   ├── tictactoe.js         # real playable board + simple AI
│   │   ├── rps.js                # rock-paper-scissors
│   │   ├── chessPuzzle.js         # mate-in-1 multiple choice
│   │   ├── pictureQuiz.js          # flag-guessing (images via flagcdn.com)
│   │   ├── wordScramble.js          # unscramble the word
│   │   └── memoryMatch.js            # emoji pair-matching
│   ├── admin.js                  # Express API: drops, tasks, leaderboard, broadcast, CSV
│   └── public/index.html            # panel UI
├── package.json
├── .env.example
└── README.md
```

### Game task prizes
Game-task prizes are awarded as bot points, not cash. The bot can automatically credit the configured points and show the prize to the user; a real-money payout system would require a payment provider and a withdrawal flow.

## Known limitations (worth knowing before relying on this for anything high-stakes)

- **Manual tasks** have zero verification — anyone can tap "Mark Done".
- **Referral rewards** fire on first `/start` with a valid payload — a determined person could create
  throwaway accounts to farm points. Fine for casual engagement, not for anything with real payout.
- **Broadcast** has no scheduling or audience segmentation — it's "send to everyone, right now."
- **The "awaiting screenshot" state is in-memory** — a bot restart between tapping "Send Screenshot" and
  sending the photo means the user needs to tap it again.
- **Cooldown state is in-memory** — resets on restart, which just means everyone's briefly un-throttled
  right after a deploy. Not a real issue in practice.


## Rush Gamification V2

The bot now includes a full reward loop:
- XP and automatic levels
- Daily streaks and best-streak tracking
- Daily game challenges with automatic rewards
- Achievement badges
- 7-day leaderboard
- Mystery boxes with rarity-based rewards
- Rotating jackpot events with weighted ticket draws
- Referral milestone bonuses at 5/10/25/50 referrals
- Game-task automatic completion and point rewards
- Point transaction ledger for reward analytics
- Admin gamification analytics and jackpot controls

Jackpot settings can be configured with `JACKPOT_POINTS` and `JACKPOT_HOURS`.


## ⚔️ PvP Wars
Players can challenge another player who has already started the bot with `/war @username`. The target receives a Telegram notification with **Accept** and **Decline** buttons. Accepted wars are best-of-5 Rock Paper Scissors; first to 3 round wins gets the war prize (+25 points and +50 XP).

Optional menu artwork can be configured with `MENU_IMAGE_URL` and `WAR_MENU_IMAGE_URL`.

## 👑 Rush Admin & High-Point Gifts

Set `ADMIN_USER_IDS` to comma-separated Telegram user IDs and `ADMIN_HIGH_POINTS` to the point threshold. Admins can use:

- `/admin` — open the admin center
- `/vipusers` — list high-point players with username, user ID, points and level
- `/gift <user_id|@username>` — enter gift mode, then send the next Telegram message/file to the player
- `/giftpoints <user_id> <amount>` — award points directly
- `/cancelgift` — cancel gift mode

Gift mode uses Telegram's message copy mechanism, so admins can send supported Telegram content such as ZIP/document files, photos, videos, audio, voice messages, stickers and text without manually downloading/re-uploading them. The recipient must have started the bot so the bot can DM them.


## 🚀 Render Deployment

RUSH UNIVERSE is prepared for Render as a Node.js Web Service. The service exposes `/health`, binds to `0.0.0.0`, uses Render's `PORT`, and stores SQLite data under `DATA_DIR`.

Recommended Render settings:
- Build command: `npm install`
- Start command: `npm start`
- Health check path: `/health`
- Node.js: `20.x`
- Persistent disk mount: `/var/data`
- `DATA_DIR=/var/data`

The included `render.yaml` configures these settings. A persistent disk is recommended because Render's default filesystem is ephemeral.

## Button reliability fixes (V12 maintenance)
- Menus now handle Telegram photo/caption messages and text messages correctly when navigating with inline buttons.
- If a menu cannot be edited in place, RUSH falls back to editing the caption or sending a fresh message so the keyboard is not silently lost.
- Unhandled/stale callback buttons now return a clear alert instead of appearing dead.
- Duplicate `/withdrawals` registration was removed.
- The normal Tic-Tac-Toe mode remains user-vs-RUSH-BOT; it does not require a second human player.
