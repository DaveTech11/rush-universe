require('dotenv').config();
const { bot, sweepScheduledDrops, sweepExpiredDrops } = require('./bot');
const { createAdminApp } = require('./admin');
const { recheckChannelTasks } = require('./tasks');
const db = require('./db');

const TASK_RECHECK_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const DROP_SWEEP_INTERVAL_MS = 30 * 1000; // 30 seconds — scheduled posting + expiry feel responsive at this cadence
const KEEPALIVE_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

function safeError(label, err) {
  try { console.error(`[RUSH SAFE ERROR] ${label}:`, err?.stack || err?.message || err); } catch (_) {}
}

// Never let an unhandled promise/exception terminate the running service.
process.on('unhandledRejection', (err) => safeError('unhandledRejection', err));
process.on('uncaughtException', (err) => safeError('uncaughtException', err));

async function keepAlive() {
  const configured = String(process.env.KEEPALIVE_URL || '').trim();
  const renderHost = String(process.env.RENDER_EXTERNAL_HOSTNAME || '').trim();
  const url = configured || (renderHost ? `https://${renderHost}/health` : '');
  if (!url || typeof fetch !== 'function') return;
  try {
    const response = await fetch(url, { method: 'GET', headers: { 'User-Agent': 'RUSH-UNIVERSE-KeepAlive' } });
    console.log(`[RUSH KEEPALIVE] ${response.status} ${url}`);
  } catch (err) {
    safeError('keepalive request', err);
  }
}

async function main() {
  const app = createAdminApp();
  const port = Number(process.env.PORT) || 10000;
  const host = process.env.HOST || '0.0.0.0';
  app.listen(port, host, () => console.log(`Admin panel running on ${host}:${port}`));

  try {
    await bot.launch();
  } catch (err) {
    safeError('bot launch', err);
  }
  db.createJackpot({ title: 'Rush Jackpot', prize_points: Number(process.env.JACKPOT_POINTS || 1000), durationHours: Number(process.env.JACKPOT_HOURS || 24) });
  console.log('Bot is polling for updates...');

  // Keeps the Render web service active by periodically hitting its health endpoint.
  // Set KEEPALIVE_URL manually if you want to use a custom public health URL.
  keepAlive().catch((err) => safeError('initial keepalive', err));
  setInterval(() => keepAlive().catch((err) => safeError('keepalive timer', err)), KEEPALIVE_INTERVAL_MS);

  // Catches users who left a required channel after being verified.
  setInterval(() => {
    recheckChannelTasks(bot).catch((err) => safeError('recheckChannelTasks failed', err));
  }, TASK_RECHECK_INTERVAL_MS);

  // Auto-posts drops whose scheduled time has arrived, and auto-expires drops past their deadline.
  setInterval(async () => {
    sweepScheduledDrops().catch((err) => safeError('sweepScheduledDrops failed', err));
    sweepExpiredDrops().catch((err) => safeError('sweepExpiredDrops failed', err));
    try {
      const results = db.drawDueJackpotsTxn();
      for (const result of results) {
        if (result.winner_user_id) {
          await bot.telegram.sendMessage(result.winner_user_id, `🎰 <b>JACKPOT WINNER!</b>\n\n🎉 You won <b>${result.event.prize_points} points</b> in the Rush Jackpot!`, { parse_mode: 'HTML' }).catch(() => {});
        }
        db.createJackpot({ title: 'Rush Jackpot', prize_points: Number(process.env.JACKPOT_POINTS || 1000), durationHours: Number(process.env.JACKPOT_HOURS || 24) });
      }
    } catch (err) { safeError('jackpot sweep failed', err); }
  }, DROP_SWEEP_INTERVAL_MS);

  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

main().catch((err) => {
  safeError('startup error', err);
  // Keep the process alive; Render can still reach /health while transient startup
  // problems are logged instead of immediately terminating the service.
});
