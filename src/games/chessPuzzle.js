const { Markup } = require('telegraf');

// Small curated bank of "find the winning move" puzzles rendered as an emoji board.
// Multiple choice keeps it playable with plain inline buttons — no full chess engine needed.
const PUZZLES = [
  {
    board:
      '8  ▫️♜▫️▫️▫️▫️♚▫️\n' +
      '7  ▫️▫️▫️▫️▫️♟▫️▫️\n' +
      '6  ▫️▫️▫️▫️▫️▫️▫️▫️\n' +
      '5  ▫️▫️▫️▫️▫️▫️▫️▫️\n' +
      '4  ▫️▫️▫️▫️▫️▫️▫️▫️\n' +
      '3  ▫️▫️▫️▫️▫️▫️▫️▫️\n' +
      '2  ▫️▫️▫️▫️▫️▫️▫️▫️\n' +
      '1  ▫️▫️▫️▫️▫️▫️♔♖\n' +
      '    a b c d e f g h',
    question: 'White to move — mate in 1. What do you play?',
    options: ['Rh8#', 'Rg1', 'Kg2', 'Rd8'],
    correctIndex: 0,
  },
  {
    board:
      '8  ▫️▫️▫️▫️♚▫️▫️▫️\n' +
      '7  ▫️▫️▫️▫️▫️▫️♛▫️\n' +
      '6  ▫️▫️▫️▫️▫️▫️▫️▫️\n' +
      '5  ▫️▫️▫️▫️▫️▫️▫️▫️\n' +
      '4  ▫️▫️▫️▫️▫️▫️▫️▫️\n' +
      '3  ▫️▫️▫️▫️▫️▫️▫️▫️\n' +
      '2  ▫️▫️▫️▫️▫️▫️▫️▫️\n' +
      '1  ▫️▫️▫️▫️♔▫️▫️▫️\n' +
      '    a b c d e f g h',
    question: 'Black to move — mate in 1. What do you play?',
    options: ['Qe2', 'Qg1', 'Qxe4#', 'Qb2'],
    correctIndex: 2,
  },
  {
    board:
      '8  ♜▫️▫️▫️♚▫️▫️▫️\n' +
      '7  ▫️▫️▫️▫️▫️♙▫️▫️\n' +
      '6  ▫️▫️▫️▫️▫️▫️▫️▫️\n' +
      '5  ▫️▫️▫️▫️▫️▫️▫️▫️\n' +
      '4  ▫️▫️▫️▫️▫️▫️▫️▫️\n' +
      '3  ▫️▫️▫️▫️▫️▫️▫️▫️\n' +
      '2  ▫️▫️▫️▫️▫️▫️▫️▫️\n' +
      '1  ▫️▫️▫️▫️♔▫️▫️♖\n' +
      '    a b c d e f g h',
    question: 'White to move — mate in 1. What do you play?',
    options: ['Rh8#', 'Kd2', 'f8=Q', 'Rh7'],
    correctIndex: 0,
  },
];

function randomPuzzle() {
  const idx = Math.floor(Math.random() * PUZZLES.length);
  return { idx, ...PUZZLES[idx] };
}

function keyboard(puzzleIdx, options) {
  return Markup.inlineKeyboard(
    options.map((opt, i) => [Markup.button.callback(opt, `puzzle:${puzzleIdx}:${i}`)])
  );
}

module.exports = { PUZZLES, randomPuzzle, keyboard };
