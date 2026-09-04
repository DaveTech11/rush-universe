const { Markup } = require('telegraf');

// Uses flagcdn.com — free, no API key needed — for the actual flag image.
const BANK = [
  { code: 'jp', name: 'Japan', options: ['Japan', 'South Korea', 'Bangladesh', 'Palau'], correctIndex: 0 },
  { code: 'br', name: 'Brazil', options: ['Portugal', 'Brazil', 'Jamaica', 'Cameroon'], correctIndex: 1 },
  { code: 'ca', name: 'Canada', options: ['Peru', 'Austria', 'Canada', 'Lebanon'], correctIndex: 2 },
  { code: 'ke', name: 'Kenya', options: ['Kenya', 'Ghana', 'Ethiopia', 'Malawi'], correctIndex: 0 },
  { code: 'gr', name: 'Greece', options: ['Israel', 'Greece', 'Argentina', 'Uruguay'], correctIndex: 1 },
  { code: 'mx', name: 'Mexico', options: ['Italy', 'Hungary', 'Mexico', 'Bulgaria'], correctIndex: 2 },
];

function randomQuestion() {
  const idx = Math.floor(Math.random() * BANK.length);
  const q = BANK[idx];
  return { idx, imageUrl: `https://flagcdn.com/w320/${q.code}.png`, ...q };
}

function keyboard(quizIdx, options) {
  return Markup.inlineKeyboard(
    options.map((opt, i) => [Markup.button.callback(opt, `quiz:${quizIdx}:${i}`)])
  );
}

module.exports = { BANK, randomQuestion, keyboard };
