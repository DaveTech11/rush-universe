const { Markup } = require('telegraf');

function createRoom(creatorId, creatorName, premium = false) {
  return {
    creatorId,
    creatorName,
    premium,
    maxPlayers: 8,
    players: [{ id: creatorId, name: creatorName, lives: 2, score: 0, eliminated: false }],
    round: 1,
    maxRounds: 10,
    turnIndex: 0,
    tiles: [],
    bombs: [],
    started: false,
    finished: false,
    awaiting: false,
    streak: 0,
    prize: 5000,
    turnSeconds: 15,
  };
}

function makeBoard() {
  const bomb = Math.floor(Math.random() * 12);
  const second = Math.random() < .22 ? (() => { let x; do x = Math.floor(Math.random()*12); while (x === bomb); return x; })() : null;
  const bombs = second === null ? [bomb] : [bomb, second];
  return Array.from({ length: 12 }, (_, i) => bombs.includes(i) ? '💣' : '🔘');
}

function resetRound(room) {
  room.tiles = makeBoard();
  room.bombs = room.tiles.map((v,i)=>v==='💣'?i:null).filter(v=>v!==null);
  room.awaiting = true;
}

function activePlayers(room) { return room.players.filter(p => !p.eliminated); }
function currentPlayer(room) { return activePlayers(room)[room.turnIndex % Math.max(1, activePlayers(room).length)]; }
function nextTurn(room) { const list=activePlayers(room); if (!list.length) return; room.turnIndex = (room.turnIndex + 1) % list.length; }
function boardButtons(room) {
  return [0,1,2,3].map(r => [0,1,2].map(c => {
    const i=r*3+c; return Markup.button.callback(room.started && room.awaiting ? `🔘 ${i+1}` : `▫️ ${i+1}`, `bomb:tile:${i}`);
  }));
}
function lobbyKeyboard(code, creatorId) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🚪 ᴊᴏɪɴ', `bomb:join:${code}`), Markup.button.callback('👥 ᴘʟᴀʏᴇʀs', `bomb:players:${code}`)],
    [Markup.button.callback('▶️ sᴛᴀʀᴛ', `bomb:start:${code}`), Markup.button.callback('⚙️ sᴇᴛᴛɪɴɢs', `bomb:settings:${code}`)],
    [Markup.button.callback('🏆 ʟᴇᴀᴅᴇʀʙᴏᴀʀᴅ', 'nav_games'), Markup.button.callback('❌ ʟᴇᴀᴠᴇ', `bomb:leave:${code}`)],
  ]);
}
function gameKeyboard(room) {
  const rows=boardButtons(room);
  rows.push([Markup.button.callback('🛡️ sʜɪᴇʟᴅ', 'bomb:power:shield'), Markup.button.callback('🔍 sᴄᴀɴ', 'bomb:power:scan')]);
  rows.push([Markup.button.callback('🔄 ʀᴇsᴛᴀʀᴛ', `bomb:restart:${room.code}`), Markup.button.callback('🚪 ʟᴇᴀᴠᴇ', `bomb:leave:${room.code}`)]);
  return Markup.inlineKeyboard(rows);
}
function lobbyText(room) {
  const premium = room.premium ? '\n💎 ᴘʀᴇᴍɪᴜᴍ ᴇғғᴇᴄᴛs: ᴏɴ' : '';
  return `╭━━━〔 🎮 ʙᴏᴍʙ ᴀʀᴇɴᴀ 〕━━━╮\n┃\n┃ 👤 ᴄʀᴇᴀᴛᴏʀ: @${room.creatorName}\n┃ 👥 ᴘʟᴀʏᴇʀs: ${room.players.length}/${room.maxPlayers}\n┃ 💣 ᴍᴏᴅᴇ: ᴇʟɪᴍɪɴᴀᴛɪᴏɴ\n┃ 🔥 ʀᴏᴜɴᴅ: ${room.round}/${room.maxRounds}\n┃ ❤️ ʟɪᴠᴇs: 2\n┃ 🏆 ᴘʀɪᴢᴇ: ${room.prize.toLocaleString()} ᴄᴏɪɴs\n┃ ⚡ ᴛᴜʀɴ ᴛɪᴍᴇ: ${room.turnSeconds}s${premium}\n┃\n┃ 👥 ᴡᴀɪᴛɪɴɢ ғᴏʀ ᴘʟᴀʏᴇʀs...\n╰━━━━━━━━━━━━━━━━━━━━━━╯`;
}
function gameText(room, notice='') {
  const current=currentPlayer(room);
  const players=room.players.map(p=>`${p.eliminated?'☠️':'❤️'} ${p.name}: ${p.score}`).join('\n');
  const board=room.tiles.map((v,i)=>v==='💣' && !room.awaiting?'💣':room.awaiting?'🔘':'💚').reduce((a,v,i)=>{ if(i%3===0)a.push([]); a[a.length-1].push(v); return a;},[]).map(r=>r.join(' ')).join('\n');
  return `╭━━〔 💣 ʙᴏᴍʙ ᴀʀᴇɴᴀ 〕━━╮\n\n🔥 ʀᴏᴜɴᴅ: ${room.round}/${room.maxRounds}\n👤 ᴛᴜʀɴ: ${current ? current.name : '—'}\n❤️ ʟɪᴠᴇs: ${current ? '❤️'.repeat(Math.max(0,current.lives)) : '—'}\n🔥 sᴛʀᴇᴀᴋ: ${room.streak}\n\n${notice?notice+'\n\n':''}ᴄʜᴏᴏsᴇ ᴀ ᴛɪʟᴇ 👇\n\n${board}\n\n${players}\n╰━━━━━━━━━━━━━━━━━━╯`;
}
module.exports={createRoom,resetRound,activePlayers,currentPlayer,nextTurn,lobbyKeyboard,gameKeyboard,lobbyText,gameText};
