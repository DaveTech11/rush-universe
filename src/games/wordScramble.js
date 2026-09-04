const { Markup } = require('telegraf');

const BANK = [
  { word: 'PYTHON', options: ['PYTHON', 'JAVA', 'RUBY', 'SWIFT'], correctIndex: 0 },
  { word: 'GUITAR', options: ['VIOLIN', 'GUITAR', 'TRUMPET', 'DRUMS'], correctIndex: 1 },
  { word: 'ROCKET', options: ['GLIDER', 'BALLOON', 'ROCKET', 'BICYCLE'], correctIndex: 2 },
  { word: 'PENGUIN', options: ['PENGUIN', 'DOLPHIN', 'OSTRICH', 'CAMEL'], correctIndex: 0 },
  { word: 'VOLCANO', options: ['GLACIER', 'DESERT', 'CANYON', 'VOLCANO'], correctIndex: 3 },
  { word: 'DIAMOND', options: ['DIAMOND', 'EMERALD', 'SAPPHIRE', 'RUBY'], correctIndex: 0 },
];

function scramble(word) {
  const letters = word.split('');
  // Reshuffle until it doesn't accidentally equal the original word.
  do {
    for (let i = letters.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [letters[i], letters[j]] = [letters[j], letters[i]];
    }
  } while (letters.join('') === word && word.length > 1);
  return letters.join(' ');
}

function randomQuestion() {
  const idx = Math.floor(Math.random() * BANK.length);
  const q = BANK[idx];
  return { idx, scrambled: scramble(q.word), ...q };
}

function keyboard(idx, options) {
  return Markup.inlineKeyboard(
    options.map((opt, i) => [Markup.button.callback(opt, `scramble:${idx}:${i}`)])
  );
}

module.exports = { BANK, randomQuestion, keyboard };
