const { Markup } = require('telegraf');

const CHOICES = { rock: '🪨', paper: '📄', scissors: '✂️' };
const BEATS = { rock: 'scissors', paper: 'rock', scissors: 'paper' };

function keyboard() {
  return Markup.inlineKeyboard([
    Object.keys(CHOICES).map(c => Markup.button.callback(CHOICES[c], `rps:${c}`)),
  ]);
}

function play(userChoice) {
  const options = Object.keys(CHOICES);
  const botChoice = options[Math.floor(Math.random() * options.length)];
  let result;
  if (userChoice === botChoice) result = 'draw';
  else if (BEATS[userChoice] === botChoice) result = 'win';
  else result = 'lose';
  return { botChoice, result };
}

function resultText(userChoice, botChoice, result) {
  const line = `You: ${CHOICES[userChoice]}  vs  Bot: ${CHOICES[botChoice]}`;
  if (result === 'win') return `${line}\n\n🎉 <b>You win!</b> Point earned.`;
  if (result === 'lose') return `${line}\n\n😅 <b>Bot wins this round.</b> Try again any time.`;
  return `${line}\n\n🤝 <b>Draw.</b> Go again!`;
}

module.exports = { keyboard, play, resultText, CHOICES };
