const { Markup } = require('telegraf');

const WEAPONS = ['🔫 SMG', '🔫 AR', '🎯 SNIPER', '💥 SHOTGUN', '🔫 PISTOL'];

function kb(rows) { return Markup.inlineKeyboard(rows); }

function battleRoyaleState() {
  return { hp: 100, armor: 50, ammo: 30, kills: 0, enemies: 7, zone: 1, medkits: 2, status: 'alive' };
}
function battleRoyaleKeyboard(s) {
  return kb([
    [Markup.button.callback('🎯 ᴀɪᴍ & ғɪʀᴇ', `br:fire`), Markup.button.callback('🏃 ᴍᴏᴠᴇ', `br:move`)],
    [Markup.button.callback('💊 ʜᴇᴀʟ', `br:heal`), Markup.button.callback('🛡️ ᴄᴏᴠᴇʀ', `br:cover`)],
    [Markup.button.callback('🎒 ʟᴏᴏᴛ', `br:loot`), Markup.button.callback('🏁 ᴇxɪᴛ', `br:exit`)],
  ]);
}
function battleRoyaleText(s) {
  return `🔥 <b>ʀᴜsʜ ʙᴀᴛᴛʟᴇ ʀᴏʏᴀʟᴇ</b>\n\n❤️ <b>${s.hp}</b>   🛡️ <b>${s.armor}</b>   🔫 <b>${s.ammo}</b>\n👥 ᴇɴᴇᴍɪᴇs: <b>${s.enemies}</b>   💀 ᴋɪʟʟs: <b>${s.kills}</b>\n☢️ sᴀғᴇ ᴢᴏɴᴇ: <b>${s.zone}</b>\n\n<b>ᴄʜᴏᴏsᴇ ʏᴏᴜʀ ɴᴇxᴛ ᴍᴏᴠᴇ.</b>`;
}

function gunGameState() { return { index: 0, kills: 0, target: 5, hp: 100, ammo: 8 }; }
function gunGameText(s) { return `🔫 <b>ʀᴜsʜ ɢᴜɴ ɢᴀᴍᴇ</b>\n\nᴡᴇᴀᴘᴏɴ: <b>${WEAPONS[s.index]}</b>\n💀 ᴋɪʟʟs: <b>${s.kills}/${s.target}</b>\n❤️ ʜᴘ: <b>${s.hp}</b>\n\nᴇᴠᴇʀʏ ᴋɪʟʟ ᴜɴʟᴏᴄᴋs ᴛʜᴇ ɴᴇxᴛ ᴡᴇᴀᴘᴏɴ.`; }
function gunGameKeyboard() { return kb([[Markup.button.callback('🎯 ғɪʀᴇ', 'gg:fire'), Markup.button.callback('🔄 ʀᴇʟᴏᴀᴅ', 'gg:reload')],[Markup.button.callback('⬅️ ɢᴀᴍᴇs', 'nav_games')]]); }

function sniperState() { return { round: 1, wins: 0, enemyWins: 0, aim: 0 }; }
function sniperText(s) { return `🎯 <b>sɴɪᴘᴇʀ ᴅᴜᴇʟ</b>\n\nʀᴏᴜɴᴅ: <b>${s.round}/5</b>\n👤 ʏᴏᴜ: <b>${s.wins}</b>  vs  🤖 ᴇɴᴇᴍʏ: <b>${s.enemyWins}</b>\n\nᴘɪᴄᴋ ʏᴏᴜʀ sʜᴏᴛ.`; }
function sniperKeyboard() { return kb([[Markup.button.callback('🧠 ʜᴇᴀᴅsʜᴏᴛ', 'sniper:head'), Markup.button.callback('🎯 ᴄʜᴇsᴛ', 'sniper:body')],[Markup.button.callback('🏃 ᴍᴏᴠᴇ', 'sniper:move')],[Markup.button.callback('⬅️ ɢᴀᴍᴇs', 'nav_games')]]); }

function searchDestroyState() { return { round: 1, wins: 0, enemyWins: 0, planted: false }; }
function sdText(s) { return `💣 <b>sᴇᴀʀᴄ & ᴅᴇsᴛʀᴏʏ</b>\n\nʀᴏᴜɴᴅ: <b>${s.round}/5</b>\n🔴 ʏᴏᴜ: <b>${s.wins}</b>  vs  🔵 ᴇɴᴇᴍʏ: <b>${s.enemyWins}</b>\n\n${s.planted ? '💣 ᴄʜᴀʀɢᴇ ᴘʟᴀɴᴛᴇᴅ — ᴅᴇғᴇɴᴅ ɪᴛ!' : 'ᴄʜᴏᴏsᴇ ᴀ ᴛᴀᴄᴛɪᴄ.'}`; }
function sdKeyboard() { return kb([[Markup.button.callback('💣 ᴘʟᴀɴᴛ', 'sd:plant'), Markup.button.callback('⚔️ ʀᴜsʜ', 'sd:rush')],[Markup.button.callback('🛡️ ʜᴏʟᴅ', 'sd:hold')],[Markup.button.callback('⬅️ ɢᴀᴍᴇs', 'nav_games')]]); }

module.exports = { battleRoyaleState, battleRoyaleKeyboard, battleRoyaleText, gunGameState, gunGameText, gunGameKeyboard, sniperState, sniperText, sniperKeyboard, searchDestroyState, sdText, sdKeyboard };
