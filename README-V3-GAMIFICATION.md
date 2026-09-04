# Rush Bot V3 — Gamification + Tiny Caps

Added a reusable `src/tinyCaps.js` helper for the requested tiny-caps visual style.

Recommended usage:
```js
const { tiny, trc } = require('./src/tinyCaps');

bot.sendMessage(chatId, trc.message({
  title: 'RUSH ARENA',
  body: `${tiny('Play games and complete quests to earn rewards.')}`,
  footer: 'Build your streak and climb the leaderboard.'
}), { parse_mode: 'HTML' });
```

Keep URLs, usernames, callback data, IDs, and code values unchanged where their exact characters matter.
