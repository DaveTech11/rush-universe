const { Markup } = require('telegraf');

const LINES = [
  [0,1,2],[3,4,5],[6,7,8],
  [0,3,6],[1,4,7],[2,5,8],
  [0,4,8],[2,4,6],
];

function checkWinner(board) {
  for (const [a,b,c] of LINES) {
    if (board[a] && board[a] === board[b] && board[b] === board[c]) return board[a];
  }
  if (board.every(cell => cell)) return 'draw';
  return null;
}

// Very small heuristic AI: win if possible, block if needed, else center/corner/random.
function botMove(board) {
  const empty = () => board.map((v,i)=>v?null:i).filter(i=>i!==null);

  const tryWinOrBlock = (mark) => {
    for (const i of empty()) {
      const copy = [...board];
      copy[i] = mark;
      if (checkWinner(copy) === mark) return i;
    }
    return null;
  };

  return tryWinOrBlock('O') ?? tryWinOrBlock('X') ??
    (board[4] === null ? 4 : null) ??
    [0,2,6,8].find(i => board[i] === null) ??
    empty()[Math.floor(Math.random() * empty().length)];
}

function renderKeyboard(sessionId, board) {
  const symbol = (v) => v === 'X' ? '❌' : v === 'O' ? '⭕' : '▫️';
  const rows = [];
  for (let r = 0; r < 3; r++) {
    rows.push([0,1,2].map(c => {
      const i = r*3+c;
      return Markup.button.callback(symbol(board[i]), board[i] ? 'noop' : `ttt:${sessionId}:${i}`);
    }));
  }
  return Markup.inlineKeyboard(rows);
}

function statusText(result) {
  if (result === 'X') return "🎉 <b>You win!</b> That's a point in the bag.";
  if (result === 'O') return '🤖 <b>The bot got you this time.</b> Tap 🎮 Play Games to try again.';
  if (result === 'draw') return "🤝 <b>It's a draw.</b> No shame, but no point either. Try again!";
  return "🎮 <b>Your move</b> — tap a square. You're ❌, the bot is ⭕.";
}

module.exports = { checkWinner, botMove, renderKeyboard, statusText };
