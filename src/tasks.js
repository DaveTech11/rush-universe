const db = require('./db');

// The only channel type we can verify with certainty: Telegram's own getChatMember API.
// Bot must be an admin of the target channel for this to work reliably.
async function isTelegramMember(bot, targetChat, userId) {
  try {
    const member = await bot.telegram.getChatMember(targetChat, userId);
    return ['creator', 'administrator', 'member'].includes(member.status);
  } catch (err) {
    return false;
  }
}

// Runs on a timer (see index.js). Anyone whose channel_join task is marked
// "completed" gets silently re-checked; if they've left, the task flips back
// to "blocked" and they get a DM telling them to rejoin.
async function recheckChannelTasks(bot) {
  const rows = db.listCompletedChannelTaskUsers();
  for (const row of rows) {
    const stillMember = await isTelegramMember(bot, row.target_chat, row.user_id);
    if (!stillMember) {
      db.setUserTaskStatus(row.user_id, row.task_id, 'blocked');
      try {
        await bot.telegram.sendMessage(
          row.user_id,
          `⚠️ Looks like you left <b>${escapeHtml(row.label)}</b> — that task is now blocked.\n` +
          `Rejoin the channel, then open /tasks and tap "Recheck" to restore it.`,
          { parse_mode: 'HTML' }
        );
      } catch (e) {
        // User may have blocked the bot — nothing more we can do.
      }
    }
  }
}

function escapeHtml(s = '') {
  return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

module.exports = { isTelegramMember, recheckChannelTasks };
