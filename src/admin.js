const express = require('express');
const basicAuth = require('express-basic-auth');
const path = require('path');
const db = require('./db');
const { postDrop, bot } = require('./bot');

function createAdminApp() {
  const app = express();
  app.use(express.json());

  // Render health check endpoint must remain public.
  app.get('/health', (req, res) => res.status(200).json({ ok: true, service: 'rush-universe', uptime: process.uptime() }));
  app.get('/ping', (req, res) => res.status(200).json({ ok: true, pong: true, uptime: process.uptime() }));

  app.use(
    basicAuth({
      users: { [process.env.ADMIN_USER || 'admin']: process.env.ADMIN_PASSWORD || 'change-me' },
      challenge: true,
    })
  );

  app.use(express.static(path.join(__dirname, 'public')));

  app.get('/api/drops', (req, res) => {
    res.json(db.listDrops());
  });

  app.get('/api/drops/:id/claims', (req, res) => {
    res.json(db.listClaims(req.params.id));
  });

  app.get('/api/drops/:id/claims/export', (req, res) => {
    const claims = db.listClaims(req.params.id);
    const csv = db.toCsv(claims, ['id', 'user_id', 'username', 'code', 'claimed_at']);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="drop-${req.params.id}-claims.csv"`);
    res.send(csv);
  });

  app.post('/api/drops', (req, res) => {
    const { title, description, imageUrl, prizeText, stock, expiresInMinutes, scheduledAt } = req.body;
    if (!title || !stock) {
      return res.status(400).json({ error: 'title and stock are required' });
    }
    const drop = db.createDrop({
      title,
      description,
      imageUrl,
      prizeText,
      stock: Number(stock),
      expiresInMinutes: expiresInMinutes ? Number(expiresInMinutes) : null,
      scheduledAt: scheduledAt || null,
    });
    res.json(drop);
  });

  app.post('/api/drops/:id/post', async (req, res) => {
    try {
      const drop = db.getDrop(req.params.id);
      if (!drop) return res.status(404).json({ error: 'not found' });
      const chatId = process.env.TELEGRAM_CHAT_ID;
      if (!chatId) return res.status(400).json({ error: 'TELEGRAM_CHAT_ID not configured' });
      await postDrop(chatId, drop);
      res.json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  // ---- Tasks management ----
  app.get('/api/tasks', (req, res) => {
    res.json(db.listAllTasks());
  });

  app.post('/api/tasks', (req, res) => {
    const { type, label, target_chat, link, game_type, reward_points } = req.body;
    if (!type || !label) return res.status(400).json({ error: 'type and label are required' });
    if (!['channel_join', 'whatsapp_join', 'manual', 'game'].includes(type)) {
      return res.status(400).json({ error: 'type must be channel_join, whatsapp_join, manual, or game' });
    }
    const allowedGames = ['tictactoe', 'rps', 'chess', 'quiz', 'scramble', 'memory'];
    if (type === 'game' && !allowedGames.includes(game_type)) {
      return res.status(400).json({ error: 'A valid game_type is required for game tasks' });
    }
    const reward = Math.max(0, Number(reward_points) || 0);
    res.json(db.createTask({ type, label, target_chat, link, game_type, reward_points: reward }));
  });

  app.get('/api/reviews', (req, res) => {
    res.json(db.listPendingReviews());
  });

  // ---- Leaderboard ----
  app.get('/api/leaderboard', (req, res) => {
    res.json(db.topUsers(Number(req.query.limit) || 20));
  });

  app.get('/api/leaderboard/export', (req, res) => {
    const users = db.topUsers(10000);
    const csv = db.toCsv(users, ['user_id', 'username', 'points', 'created_at']);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="leaderboard.csv"');
    res.send(csv);
  });

  // ---- Gamification dashboard ----
  app.get('/api/gamification/analytics', (req, res) => {
    const users = db.db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
    const activeToday = db.db.prepare("SELECT COUNT(*) AS n FROM user_stats WHERE last_active_date = date('now')").get().n;
    const games = db.db.prepare('SELECT COUNT(*) AS n FROM game_sessions').get().n;
    const taskCompletions = db.db.prepare("SELECT COUNT(*) AS n FROM user_tasks WHERE status = 'completed'").get().n;
    const pointsAwarded = db.db.prepare("SELECT COALESCE(SUM(amount),0) AS n FROM point_transactions WHERE amount > 0").get().n;
    const jackpot = db.jackpotStatus();
    res.json({ users, activeToday, games, taskCompletions, pointsAwarded, jackpot });
  });

  app.get('/api/gamification/weekly', (req, res) => {
    res.json(db.weeklyLeaderboard(Number(req.query.limit) || 20));
  });

  app.post('/api/jackpot', (req, res) => {
    const jackpot = db.createJackpot({
      title: req.body.title || 'Rush Jackpot',
      prize_points: Number(req.body.prize_points) || 1000,
      durationHours: Number(req.body.durationHours) || 24,
    });
    res.json(jackpot);
  });

  // ---- Broadcast ----
  app.post('/api/broadcast', async (req, res) => {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'message is required' });
    const userIds = db.listAllUserIds();
    let sent = 0;
    let failed = 0;
    for (const userId of userIds) {
      try {
        await bot.telegram.sendMessage(userId, message, { parse_mode: 'HTML' });
        sent++;
      } catch (err) {
        failed++;
      }
      await new Promise((r) => setTimeout(r, 40)); // stay well under Telegram's flood limits
    }
    res.json({ sent, failed, total: userIds.length });
  });

  return app;
}

module.exports = { createAdminApp };
