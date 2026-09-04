const { Markup } = require('telegraf');

const EMOJI_SET = ['🍎', '🍌', '🐸', '🚀', '⭐', '🎈', '🍕', '🎸'];

function newBoard() {
  // 3 pairs = 6 tiles, picked randomly from the emoji set each game.
  const chosen = [...EMOJI_SET].sort(() => Math.random() - 0.5).slice(0, 3);
  const tiles = [...chosen, ...chosen].sort(() => Math.random() - 0.5);
  return {
    tiles,
    matched: tiles.map(() => false),
    firstPick: null,
  };
}

function renderKeyboard(sessionId, state) {
  const rows = [];
  for (let r = 0; r < 2; r++) {
    rows.push([0, 1, 2].map((c) => {
      const i = r * 3 + c;
      const label = state.matched[i] ? state.tiles[i] : (state.firstPick === i ? state.tiles[i] : '❓');
      const cb = state.matched[i] ? 'noop' : `memory:${sessionId}:${i}`;
      return Markup.button.callback(label, cb);
    }));
  }
  return Markup.inlineKeyboard(rows);
}

function statusText(state, message) {
  const matchedCount = state.matched.filter(Boolean).length;
  return message || `🧠 <b>Find the ${state.tiles.length / 2} matching pairs.</b> (${matchedCount}/${state.tiles.length} tiles matched)`;
}

module.exports = { newBoard, renderKeyboard, statusText };
