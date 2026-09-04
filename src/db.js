const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Render: point DATA_DIR at a persistent disk (recommended: /var/data).
// Local/dev fallback remains the project root.
const dataDir = process.env.DATA_DIR || path.join(__dirname, '..');
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, 'data.sqlite'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS drops (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  prize_text TEXT,
  stock INTEGER NOT NULL,
  claimed_count INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  chat_message_id INTEGER,
  expires_at TEXT,
  scheduled_at TEXT,
  scheduled_posted INTEGER NOT NULL DEFAULT 0,
  expired_notified INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS claims (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  drop_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  username TEXT,
  code TEXT NOT NULL,
  claimed_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(drop_id, user_id),
  FOREIGN KEY(drop_id) REFERENCES drops(id)
);

CREATE TABLE IF NOT EXISTS users (
  user_id INTEGER PRIMARY KEY,
  username TEXT,
  points INTEGER NOT NULL DEFAULT 0,
  whatsapp_confirmed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS game_completions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  game_type TEXT NOT NULL,
  completed_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, game_type)
);

CREATE TABLE IF NOT EXISTS game_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  game_type TEXT NOT NULL,
  state TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  label TEXT NOT NULL,
  target_chat TEXT,
  link TEXT,
  game_type TEXT,
  reward_points INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  task_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  completed_at TEXT,
  rewarded INTEGER NOT NULL DEFAULT 0,
  UNIQUE(user_id, task_id)
);

CREATE TABLE IF NOT EXISTS review_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  task_id INTEGER NOT NULL,
  telegram_file_id TEXT NOT NULL,
  admin_chat_message_id INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);



CREATE TABLE IF NOT EXISTS user_stats (
  user_id INTEGER PRIMARY KEY,
  xp INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  streak INTEGER NOT NULL DEFAULT 0,
  best_streak INTEGER NOT NULL DEFAULT 0,
  last_active_date TEXT,
  combo INTEGER NOT NULL DEFAULT 0,
  last_game_date TEXT,
  daily_game_wins INTEGER NOT NULL DEFAULT 0,
  challenge_date TEXT,
  challenge_target INTEGER NOT NULL DEFAULT 3,
  challenge_progress INTEGER NOT NULL DEFAULT 0,
  challenge_reward INTEGER NOT NULL DEFAULT 100,
  challenge_claimed INTEGER NOT NULL DEFAULT 0,
  mystery_opened INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS achievements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  achievement_key TEXT NOT NULL,
  unlocked_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, achievement_key)
);

CREATE TABLE IF NOT EXISTS jackpot_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  prize_points INTEGER NOT NULL DEFAULT 1000,
  ticket_price INTEGER NOT NULL DEFAULT 0,
  starts_at TEXT NOT NULL DEFAULT (datetime('now')),
  ends_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  winner_user_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS jackpot_tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  tickets INTEGER NOT NULL DEFAULT 1,
  UNIQUE(event_id, user_id)
);

CREATE TABLE IF NOT EXISTS referral_milestones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  milestone INTEGER NOT NULL,
  rewarded_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, milestone)
);

CREATE TABLE IF NOT EXISTS point_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL,
  reference TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS referrals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  referrer_id INTEGER NOT NULL,
  referred_id INTEGER NOT NULL UNIQUE,
  rewarded INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tournament_players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week_key TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(week_key, user_id)
);

CREATE TABLE IF NOT EXISTS wars (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  challenger_id INTEGER NOT NULL,
  opponent_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  challenger_score INTEGER NOT NULL DEFAULT 0,
  opponent_score INTEGER NOT NULL DEFAULT 0,
  round INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  accepted_at TEXT,
  finished_at TEXT,
  winner_id INTEGER
);

CREATE TABLE IF NOT EXISTS war_moves (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  war_id INTEGER NOT NULL,
  round INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  choice TEXT NOT NULL,
  UNIQUE(war_id, round, user_id)
);
`);

// Lightweight migrations for existing SQLite databases created by older builds.
function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((r) => r.name);
  if (!columns.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
ensureColumn('tasks', 'game_type', 'TEXT');
ensureColumn('tasks', 'reward_points', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('user_tasks', 'rewarded', 'INTEGER NOT NULL DEFAULT 0');

// ---------- Drops ----------
function createDrop({ title, description, imageUrl, prizeText, stock, expiresInMinutes, scheduledAt }) {
  const expiresAt = expiresInMinutes ? new Date(Date.now() + expiresInMinutes * 60000).toISOString() : null;
  const stmt = db.prepare(`
    INSERT INTO drops (title, description, image_url, prize_text, stock, expires_at, scheduled_at)
    VALUES (@title, @description, @imageUrl, @prizeText, @stock, @expiresAt, @scheduledAt)
  `);
  const info = stmt.run({
    title, description, imageUrl: imageUrl || null, prizeText, stock,
    expiresAt, scheduledAt: scheduledAt || null,
  });
  return getDrop(info.lastInsertRowid);
}
function getDrop(id) {
  return db.prepare('SELECT * FROM drops WHERE id = ?').get(id);
}
function listDrops() {
  return db.prepare('SELECT * FROM drops ORDER BY id DESC').all();
}
function setChatMessageId(dropId, messageId) {
  db.prepare('UPDATE drops SET chat_message_id = ? WHERE id = ?').run(messageId, dropId);
}
function markScheduledPosted(dropId) {
  db.prepare('UPDATE drops SET scheduled_posted = 1 WHERE id = ?').run(dropId);
}
function listDueScheduledDrops() {
  return db.prepare(`
    SELECT * FROM drops
    WHERE scheduled_at IS NOT NULL AND scheduled_posted = 0
      AND datetime(scheduled_at) <= datetime('now')
  `).all();
}
function listExpiredUnnotifiedDrops() {
  return db.prepare(`
    SELECT * FROM drops
    WHERE expires_at IS NOT NULL AND active = 1 AND expired_notified = 0
      AND datetime(expires_at) <= datetime('now')
  `).all();
}
function expireDrop(dropId) {
  db.prepare('UPDATE drops SET active = 0, expired_notified = 1 WHERE id = ?').run(dropId);
  return getDrop(dropId);
}
function listClaims(dropId) {
  return db.prepare('SELECT * FROM claims WHERE drop_id = ? ORDER BY id ASC').all(dropId);
}
function countClaimsByUser(userId) {
  return db.prepare('SELECT COUNT(*) AS n FROM claims WHERE user_id = ?').get(userId).n;
}
const claimTxn = db.transaction((dropId, userId, username, code) => {
  const drop = db.prepare('SELECT * FROM drops WHERE id = ?').get(dropId);
  if (!drop) return { ok: false, reason: 'not_found' };
  if (!drop.active) return { ok: false, reason: 'inactive' };
  if (drop.expires_at && new Date(drop.expires_at) <= new Date()) return { ok: false, reason: 'expired' };
  const already = db.prepare('SELECT * FROM claims WHERE drop_id = ? AND user_id = ?').get(dropId, userId);
  if (already) return { ok: false, reason: 'already_claimed', claim: already };
  if (drop.claimed_count >= drop.stock) return { ok: false, reason: 'sold_out' };
  db.prepare('INSERT INTO claims (drop_id, user_id, username, code) VALUES (?, ?, ?, ?)')
    .run(dropId, userId, username, code);
  db.prepare('UPDATE drops SET claimed_count = claimed_count + 1 WHERE id = ?').run(dropId);
  const updatedDrop = db.prepare('SELECT * FROM drops WHERE id = ?').get(dropId);
  return { ok: true, drop: updatedDrop, code };
});

// ---------- Users & points ----------
function getOrCreateUser(userId, username) {
  db.prepare(`INSERT INTO users (user_id, username) VALUES (?, ?)
              ON CONFLICT(user_id) DO UPDATE SET username = excluded.username`)
    .run(userId, username || null);
  return db.prepare('SELECT * FROM users WHERE user_id = ?').get(userId);
}
function getUser(userId) {
  return db.prepare('SELECT * FROM users WHERE user_id = ?').get(userId);
}
function listGameCompletions(userId) {
  return db.prepare('SELECT game_type FROM game_completions WHERE user_id = ?').all(userId).map(r => r.game_type);
}
// Awards a point the FIRST time a user beats a given game_type. Replays afterwards
// are still fun but don't add more points. Runs as one transaction so double-taps can't double-award.
const awardPointTxn = db.transaction((userId, username, gameType) => {
  getOrCreateUser(userId, username);
  const already = db.prepare('SELECT 1 FROM game_completions WHERE user_id = ? AND game_type = ?').get(userId, gameType);
  if (already) return { newlyAwarded: false, ...getUser(userId), completions: listGameCompletions(userId) };
  db.prepare('INSERT INTO game_completions (user_id, game_type) VALUES (?, ?)').run(userId, gameType);
  db.prepare('UPDATE users SET points = points + 1 WHERE user_id = ?').run(userId);
  db.prepare('INSERT INTO point_transactions (user_id, amount, reason, reference) VALUES (?, ?, ?, ?)').run(userId, 1, 'game_first_win', gameType);
  return { newlyAwarded: true, ...getUser(userId), completions: listGameCompletions(userId) };
});

// ---------- Game sessions (used by stateful games like Tic-Tac-Toe) ----------
function createSession(userId, gameType, state) {
  const info = db.prepare('INSERT INTO game_sessions (user_id, game_type, state) VALUES (?, ?, ?)')
    .run(userId, gameType, JSON.stringify(state));
  return getSession(info.lastInsertRowid);
}
function getSession(id) {
  const row = db.prepare('SELECT * FROM game_sessions WHERE id = ?').get(id);
  if (!row) return null;
  return { ...row, state: JSON.parse(row.state) };
}
function updateSession(id, state, status) {
  db.prepare('UPDATE game_sessions SET state = ?, status = ? WHERE id = ?')
    .run(JSON.stringify(state), status, id);
  return getSession(id);
}

// ---------- Tasks ----------
function createTask({ type, label, target_chat, link, game_type, reward_points }) {
  const reward = Math.max(0, Number(reward_points) || 0);
  const info = db.prepare('INSERT INTO tasks (type, label, target_chat, link, game_type, reward_points) VALUES (?, ?, ?, ?, ?, ?)')
    .run(type, label, target_chat || null, link || null, game_type || null, reward);
  return db.prepare('SELECT * FROM tasks WHERE id = ?').get(info.lastInsertRowid);
}
function listActiveTasks() {
  return db.prepare('SELECT * FROM tasks WHERE active = 1 ORDER BY id ASC').all();
}
function listAllTasks() {
  return db.prepare('SELECT * FROM tasks ORDER BY id ASC').all();
}
function getTask(id) {
  return db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
}
function getUserTaskStatus(userId, taskId) {
  return db.prepare('SELECT * FROM user_tasks WHERE user_id = ? AND task_id = ?').get(userId, taskId);
}
function getUserTaskStatuses(userId) {
  return db.prepare('SELECT * FROM user_tasks WHERE user_id = ?').all(userId);
}
function setUserTaskStatus(userId, taskId, status) {
  db.prepare(`
    INSERT INTO user_tasks (user_id, task_id, status, completed_at)
    VALUES (?, ?, ?, CASE WHEN ? = 'completed' THEN datetime('now') ELSE NULL END)
    ON CONFLICT(user_id, task_id) DO UPDATE SET status = excluded.status, completed_at = excluded.completed_at
  `).run(userId, taskId, status, status);
  return getUserTaskStatus(userId, taskId);
}
const completeTaskTxn = db.transaction((userId, username, taskId) => {
  getOrCreateUser(userId, username);
  const task = getTask(taskId);
  if (!task || !task.active) return { ok: false, reason: 'task_unavailable' };
  const current = getUserTaskStatus(userId, taskId);
  if (current?.status === 'completed') {
    return { ok: true, alreadyCompleted: true, task, rewardPoints: 0, user: getUser(userId) };
  }
  db.prepare(`
    INSERT INTO user_tasks (user_id, task_id, status, completed_at, rewarded)
    VALUES (?, ?, 'completed', datetime('now'), 0)
    ON CONFLICT(user_id, task_id) DO UPDATE SET
      status = 'completed', completed_at = datetime('now')
  `).run(userId, taskId);

  let rewardPoints = 0;
  if (task.reward_points > 0) {
    const result = db.prepare(`
      UPDATE user_tasks SET rewarded = 1
      WHERE user_id = ? AND task_id = ? AND rewarded = 0
    `).run(userId, taskId);
    if (result.changes === 1) {
      db.prepare('UPDATE users SET points = points + ? WHERE user_id = ?').run(task.reward_points, userId);
      db.prepare('INSERT INTO point_transactions (user_id, amount, reason, reference) VALUES (?, ?, ?, ?)').run(userId, task.reward_points, 'task_reward', String(task.id));
      rewardPoints = task.reward_points;
    }
  }
  return { ok: true, alreadyCompleted: false, task, rewardPoints, user: getUser(userId) };
});

function listGameTasks(gameType) {
  return db.prepare(`SELECT * FROM tasks WHERE type = 'game' AND game_type = ? AND active = 1 ORDER BY id ASC`).all(gameType);
}

function setWhatsappConfirmed(userId, username, val) {
  getOrCreateUser(userId, username);
  db.prepare('UPDATE users SET whatsapp_confirmed = ? WHERE user_id = ?').run(val ? 1 : 0, userId);
  return getUser(userId);
}

function createReview({ userId, taskId, fileId }) {
  const info = db.prepare(
    'INSERT INTO review_queue (user_id, task_id, telegram_file_id) VALUES (?, ?, ?)'
  ).run(userId, taskId, fileId);
  return db.prepare('SELECT * FROM review_queue WHERE id = ?').get(info.lastInsertRowid);
}
function setReviewAdminMessage(reviewId, messageId) {
  db.prepare('UPDATE review_queue SET admin_chat_message_id = ? WHERE id = ?').run(messageId, reviewId);
}
function getReview(id) {
  return db.prepare('SELECT * FROM review_queue WHERE id = ?').get(id);
}
function setReviewStatus(id, status) {
  db.prepare('UPDATE review_queue SET status = ? WHERE id = ?').run(status, id);
}
function listPendingReviews() {
  return db.prepare("SELECT * FROM review_queue WHERE status = 'pending' ORDER BY id DESC").all();
}

function listCompletedChannelTaskUsers() {
  // For the unfollow-recheck sweep: all users whose channel_join tasks are currently marked completed.
  return db.prepare(`
    SELECT ut.user_id, ut.task_id, t.target_chat, t.label
    FROM user_tasks ut
    JOIN tasks t ON t.id = ut.task_id
    WHERE ut.status = 'completed' AND t.type = 'channel_join' AND t.active = 1
  `).all();
}

// ---------- Leaderboard ----------
function topUsers(limit = 10) {
  return db.prepare('SELECT * FROM users ORDER BY points DESC, created_at ASC LIMIT ?').all(limit);
}
function getUserRank(userId) {
  const row = db.prepare(`
    SELECT COUNT(*) + 1 AS rank FROM users
    WHERE points > (SELECT points FROM users WHERE user_id = ?)
  `).get(userId);
  return row ? row.rank : null;
}

// ---------- Referrals ----------
// Referral "codes" are just the referrer's own Telegram user id — simplest thing
// that works with Telegram deep links (t.me/bot?start=<id>), no separate code table needed.
function recordReferral(referrerId, referredId) {
  if (referrerId === referredId) return null;
  try {
    const info = db.prepare('INSERT INTO referrals (referrer_id, referred_id) VALUES (?, ?)').run(referrerId, referredId);
    return db.prepare('SELECT * FROM referrals WHERE id = ?').get(info.lastInsertRowid);
  } catch (e) {
    return null; // already referred by someone (UNIQUE referred_id) — ignore
  }
}
const rewardReferralTxn = db.transaction((referredId) => {
  const ref = db.prepare('SELECT * FROM referrals WHERE referred_id = ? AND rewarded = 0').get(referredId);
  if (!ref) return null;
  db.prepare('UPDATE referrals SET rewarded = 1 WHERE id = ?').run(ref.id);
  db.prepare('UPDATE users SET points = points + 1 WHERE user_id = ?').run(ref.referrer_id);
  db.prepare('INSERT INTO point_transactions (user_id, amount, reason, reference) VALUES (?, ?, ?, ?)').run(ref.referrer_id, 1, 'referral', String(ref.id));
  return ref;
});
function countReferrals(userId) {
  return db.prepare('SELECT COUNT(*) AS n FROM referrals WHERE referrer_id = ?').get(userId).n;
}


// ---------- Gamification ----------
function todayKey() { return new Date().toISOString().slice(0, 10); }
function getStats(userId) {
  getOrCreateUser(userId);
  let row = db.prepare('SELECT * FROM user_stats WHERE user_id = ?').get(userId);
  if (!row) {
    db.prepare('INSERT INTO user_stats (user_id) VALUES (?)').run(userId);
    row = db.prepare('SELECT * FROM user_stats WHERE user_id = ?').get(userId);
  }
  return row;
}
function levelForXp(xp) { return Math.max(1, Math.floor(Math.sqrt(Math.max(0, xp) / 50)) + 1); }
function xpForNextLevel(level) { return Math.pow(Math.max(1, level), 2) * 50; }
function touchActivity(userId) {
  const key = todayKey();
  const stats = getStats(userId);
  if (stats.last_active_date === key) return stats;
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const streak = stats.last_active_date === yesterday ? stats.streak + 1 : 1;
  const best = Math.max(stats.best_streak, streak);
  db.prepare('UPDATE user_stats SET streak = ?, best_streak = ?, last_active_date = ? WHERE user_id = ?').run(streak, best, key, userId);
  return getStats(userId);
}
function addXpTxn(userId, amount, reason) {
  const n = Math.max(0, Number(amount) || 0);
  if (!n) return getStats(userId);
  touchActivity(userId);
  const current = getStats(userId);
  const xp = current.xp + n;
  const level = levelForXp(xp);
  db.prepare('UPDATE user_stats SET xp = ?, level = ? WHERE user_id = ?').run(xp, level, userId);
  return { ...getStats(userId), xpGained: n, leveledUp: level > current.level, reason };
}
function recordGameWin(userId, gameType) {
  touchActivity(userId);
  const key = todayKey();
  const stats = getStats(userId);
  const combo = stats.last_game_date === key ? stats.combo + 1 : 1;
  const dailyWins = stats.last_game_date === key ? stats.daily_game_wins + 1 : 1;
  db.prepare('UPDATE user_stats SET combo = ?, daily_game_wins = ?, last_game_date = ? WHERE user_id = ?').run(combo, dailyWins, key, userId);
  const xpGain = 25 + Math.min(combo * 5, 50);
  const xpResult = addXpTxn(userId, xpGain, `game:${gameType}`);
  const challenge = updateDailyChallenge(userId, 1);
  const achievementsUnlocked = unlockGameAchievements(userId, { combo, dailyWins });
  const jackpotTickets = addJackpotTicket(userId, 1);
  return { ...getStats(userId), xpGain, xpResult, challenge, achievementsUnlocked, jackpotTickets };
}
function ensureDailyChallenge(userId) {
  const stats = getStats(userId);
  const key = todayKey();
  if (stats.challenge_date === key) return stats;
  const targets = [2, 3, 5];
  const target = targets[Math.floor(Math.random() * targets.length)];
  const reward = target === 2 ? 75 : target === 3 ? 125 : 250;
  db.prepare(`UPDATE user_stats SET challenge_date = ?, challenge_target = ?, challenge_progress = 0, challenge_reward = ?, challenge_claimed = 0 WHERE user_id = ?`)
    .run(key, target, reward, userId);
  return getStats(userId);
}
function updateDailyChallenge(userId, increment = 1) {
  const stats = ensureDailyChallenge(userId);
  if (stats.challenge_claimed) return stats;
  const progress = Math.min(stats.challenge_target, stats.challenge_progress + increment);
  db.prepare('UPDATE user_stats SET challenge_progress = ? WHERE user_id = ?').run(progress, userId);
  if (progress >= stats.challenge_target) {
    const claimed = db.prepare('UPDATE user_stats SET challenge_claimed = 1 WHERE user_id = ? AND challenge_claimed = 0').run(userId);
    if (claimed.changes === 1) {
      db.prepare('UPDATE users SET points = points + ? WHERE user_id = ?').run(stats.challenge_reward, userId);
      db.prepare('INSERT INTO point_transactions (user_id, amount, reason, reference) VALUES (?, ?, ?, ?)').run(userId, stats.challenge_reward, 'daily_challenge', todayKey());
      addXpTxn(userId, 50, 'daily_challenge');
      unlockAchievement(userId, 'daily_challenger');
      return { ...getStats(userId), justCompleted: true, reward: stats.challenge_reward };
    }
  }
  return getStats(userId);
}
const ACHIEVEMENTS = {
  first_win: ['🏆 First Win', 'Win your first game'],
  game_master: ['🎮 Game Master', 'Win every game at least once'],
  streak_7: ['🔥 7-Day Streak', 'Stay active for 7 days'],
  streak_30: ['🔥 30-Day Streak', 'Stay active for 30 days'],
  combo_5: ['⚡ Combo King', 'Win 5 games in a day'],
  daily_challenger: ['🎯 Challenge Hunter', 'Complete a daily challenge'],
  point_collector: ['💰 Point Collector', 'Reach 1,000 points'],
  ranked_10: ['⚔️ Ranked Warrior', 'Win 10 ranked wars'],
  ranked_25: ['🔥 Ranked Elite', 'Win 25 ranked wars'],
  diamond: ['💎 Diamond Mind', 'Reach 2,500 points'],
  rush_legend: ['👑 Rush Legend', 'Reach 5,000 points'],
  clan_founder: ['🛡️ Clan Founder', 'Create a clan'],
  clan_hero: ['⚔️ Clan Hero', 'Earn 1,000 clan XP'],
  tournament_champion: ['🏆 Tournament Champion', 'Win a weekly tournament'],
  premium_runner: ['💎 Premium Runner', 'Claim a Premium Pass reward'],
};
function unlockAchievement(userId, key) {
  if (!ACHIEVEMENTS[key]) return false;
  const result = db.prepare('INSERT OR IGNORE INTO achievements (user_id, achievement_key) VALUES (?, ?)').run(userId, key);
  return result.changes === 1;
}
function unlockGameAchievements(userId, { combo, dailyWins }) {
  const unlocked = [];
  if (db.listGameCompletions(userId).length >= 1 && unlockAchievement(userId, 'first_win')) unlocked.push('first_win');
  if (db.listGameCompletions(userId).length >= 6 && unlockAchievement(userId, 'game_master')) unlocked.push('game_master');
  if (combo >= 5 && unlockAchievement(userId, 'combo_5')) unlocked.push('combo_5');
  const stats = getStats(userId);
  if (stats.streak >= 7 && unlockAchievement(userId, 'streak_7')) unlocked.push('streak_7');
  if (stats.streak >= 30 && unlockAchievement(userId, 'streak_30')) unlocked.push('streak_30');
  const user = getUser(userId);
  if ((user?.points || 0) >= 1000 && unlockAchievement(userId, 'point_collector')) unlocked.push('point_collector');
  if ((user?.points || 0) >= 2500 && unlockAchievement(userId, 'diamond')) unlocked.push('diamond');
  if ((user?.points || 0) >= 5000 && unlockAchievement(userId, 'rush_legend')) unlocked.push('rush_legend');
  return unlocked;
}
function listAchievements(userId) {
  return db.prepare('SELECT achievement_key, unlocked_at FROM achievements WHERE user_id = ? ORDER BY id DESC').all(userId);
}
function weeklyLeaderboard(limit = 10) {
  return db.prepare(`SELECT u.user_id, u.username, COALESCE(SUM(pt.amount),0) AS weekly_points
    FROM users u LEFT JOIN point_transactions pt ON pt.user_id = u.user_id AND datetime(pt.created_at) >= datetime('now','-7 days')
    GROUP BY u.user_id ORDER BY weekly_points DESC, u.created_at ASC LIMIT ?`).all(limit);
}
function openMysteryBoxTxn(userId, cost = 50) {
  getOrCreateUser(userId);
  const result = db.transaction(() => {
    const user = getUser(userId);
    if ((user?.points || 0) < cost) return { ok: false, reason: 'not_enough_points', user };
    const roll = Math.random();
    let reward;
    if (roll < 0.02) reward = { points: 1000, rarity: 'LEGENDARY 👑' };
    else if (roll < 0.10) reward = { points: 400, rarity: 'EPIC 💎' };
    else if (roll < 0.30) reward = { points: 150, rarity: 'RARE ⭐' };
    else reward = { points: 60, rarity: 'COMMON ✨' };
    db.prepare('UPDATE users SET points = points - ? + ? WHERE user_id = ?').run(cost, reward.points, userId);
    db.prepare('INSERT INTO point_transactions (user_id, amount, reason, reference) VALUES (?, ?, ?, ?)').run(userId, reward.points - cost, 'mystery_box', reward.rarity);
    db.prepare('UPDATE user_stats SET mystery_opened = mystery_opened + 1 WHERE user_id = ?').run(userId);
    addXpTxn(userId, 20, 'mystery_box');
    return { ok: true, reward, user: getUser(userId) };
  })();
  return result;
}
function statsSummary(userId) {
  const stats = ensureDailyChallenge(userId);
  const user = getUser(userId) || { points: 0 };
  return { user, stats, nextLevelXp: xpForNextLevel(stats.level), achievements: listAchievements(userId) };
}


function referralMilestoneTxn(userId) {
  const count = countReferrals(userId);
  const milestones = [5, 10, 25, 50];
  const rewards = { 5: 25, 10: 75, 25: 250, 50: 750 };
  const unlocked = [];
  for (const milestone of milestones) {
    if (count >= milestone) {
      const inserted = db.prepare('INSERT OR IGNORE INTO referral_milestones (user_id, milestone) VALUES (?, ?)').run(userId, milestone);
      if (inserted.changes === 1) {
        const reward = rewards[milestone];
        db.prepare('UPDATE users SET points = points + ? WHERE user_id = ?').run(reward, userId);
        db.prepare('INSERT INTO point_transactions (user_id, amount, reason, reference) VALUES (?, ?, ?, ?)').run(userId, reward, 'referral_milestone', String(milestone));
        unlocked.push({ milestone, reward });
      }
    }
  }
  return unlocked;
}
function getActiveJackpot() {
  return db.prepare("SELECT * FROM jackpot_events WHERE status = 'active' AND datetime(starts_at) <= datetime('now') AND datetime(ends_at) > datetime('now') ORDER BY id DESC LIMIT 1").get();
}
function createJackpot({ title = 'Rush Jackpot', prize_points = 1000, durationHours = 24 }) {
  const active = getActiveJackpot();
  if (active) return active;
  const endsAt = new Date(Date.now() + Number(durationHours || 24) * 3600000).toISOString();
  const info = db.prepare('INSERT INTO jackpot_events (title, prize_points, ends_at) VALUES (?, ?, ?)').run(title, Math.max(1, Number(prize_points) || 1000), endsAt);
  return db.prepare('SELECT * FROM jackpot_events WHERE id = ?').get(info.lastInsertRowid);
}
function addJackpotTicket(userId, count = 1) {
  const event = getActiveJackpot();
  if (!event) return null;
  db.prepare(`INSERT INTO jackpot_tickets (event_id, user_id, tickets) VALUES (?, ?, ?)
    ON CONFLICT(event_id, user_id) DO UPDATE SET tickets = tickets + excluded.tickets`).run(event.id, userId, Math.max(1, Number(count) || 1));
  return db.prepare('SELECT * FROM jackpot_tickets WHERE event_id = ? AND user_id = ?').get(event.id, userId);
}
function jackpotStatus() {
  const event = getActiveJackpot();
  if (!event) return null;
  const rows = db.prepare('SELECT COALESCE(SUM(tickets),0) AS total, COUNT(*) AS players FROM jackpot_tickets WHERE event_id = ?').get(event.id);
  return { ...event, totalTickets: rows.total, players: rows.players };
}
const drawDueJackpotsTxn = db.transaction(() => {
  const due = db.prepare("SELECT * FROM jackpot_events WHERE status = 'active' AND datetime(ends_at) <= datetime('now')").all();
  const results = [];
  for (const event of due) {
    const tickets = db.prepare('SELECT user_id, tickets FROM jackpot_tickets WHERE event_id = ?').all(event.id);
    const total = tickets.reduce((n, r) => n + r.tickets, 0);
    if (!total) {
      db.prepare("UPDATE jackpot_events SET status = 'drawn' WHERE id = ?").run(event.id);
      results.push({ event, winner_user_id: null });
      continue;
    }
    let roll = Math.floor(Math.random() * total);
    let winner = tickets[tickets.length - 1].user_id;
    for (const row of tickets) {
      roll -= row.tickets;
      if (roll < 0) { winner = row.user_id; break; }
    }
    db.prepare('UPDATE users SET points = points + ? WHERE user_id = ?').run(event.prize_points, winner);
    db.prepare('INSERT INTO point_transactions (user_id, amount, reason, reference) VALUES (?, ?, ?, ?)').run(winner, event.prize_points, 'jackpot', String(event.id));
    db.prepare("UPDATE jackpot_events SET status = 'drawn', winner_user_id = ? WHERE id = ?").run(winner, event.id);
    results.push({ event, winner_user_id: winner });
  }
  return results;
});

// ---------- Rush League / Weekly Tournament ----------
function leagueForPoints(points = 0) {
  const p = Number(points) || 0;
  if (p >= 5000) return { name: 'ʀᴜsʜ ʟᴇɢᴇɴᴅ', emoji: '🔥', min: 5000 };
  if (p >= 2500) return { name: 'ᴅɪᴀᴍᴏɴᴅ', emoji: '👑', min: 2500 };
  if (p >= 1500) return { name: 'ᴘʟᴀᴛɪɴᴜᴍ', emoji: '💎', min: 1500 };
  if (p >= 750) return { name: 'ɢᴏʟᴅ', emoji: '🥇', min: 750 };
  if (p >= 250) return { name: 'sɪʟᴠᴇʀ', emoji: '🥈', min: 250 };
  return { name: 'ʙʀᴏɴᴢᴇ', emoji: '🥉', min: 0 };
}
function leagueLeaderboard(limit = 10) {
  return db.prepare('SELECT user_id, username, points FROM users ORDER BY points DESC, created_at ASC LIMIT ?').all(limit).map((r, i) => ({ ...r, rank: i + 1, league: leagueForPoints(r.points) }));
}
function tournamentWeekKey(date = new Date()) {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}
function joinTournament(userId, username) {
  getOrCreateUser(userId, username);
  const week = tournamentWeekKey();
  const count = db.prepare('SELECT COUNT(*) AS n FROM tournament_players WHERE week_key = ?').get(week).n;
  if (count >= 32) return { ok: false, reason: 'full', week, count };
  const result = db.prepare('INSERT OR IGNORE INTO tournament_players (week_key, user_id) VALUES (?, ?)').run(week, userId);
  return { ok: true, joined: result.changes === 1, week, count: count + (result.changes === 1 ? 1 : 0) };
}
function tournamentStatus(limit = 32) {
  const week = tournamentWeekKey();
  const players = db.prepare(`SELECT tp.user_id, u.username, u.points FROM tournament_players tp JOIN users u ON u.user_id = tp.user_id WHERE tp.week_key = ? ORDER BY u.points DESC LIMIT ?`).all(week, limit);
  return { week, players, maxPlayers: 32 };
}

// ---------- PvP Wars ----------
function findUserByUsername(username) {
  const clean = String(username || '').trim().replace(/^@/, '');
  if (!clean) return null;
  return db.prepare('SELECT * FROM users WHERE LOWER(username) = LOWER(?) LIMIT 1').get(clean);
}
function getWar(id) { return db.prepare('SELECT * FROM wars WHERE id = ?').get(id); }
function createWar(challengerId, opponentId) {
  if (challengerId === opponentId) return { ok: false, reason: 'self' };
  const existing = db.prepare(`SELECT * FROM wars WHERE status IN ('pending','active') AND ((challenger_id = ? AND opponent_id = ?) OR (challenger_id = ? AND opponent_id = ?)) ORDER BY id DESC LIMIT 1`).get(challengerId, opponentId, opponentId, challengerId);
  if (existing) return { ok: false, reason: 'existing', war: existing };
  const info = db.prepare('INSERT INTO wars (challenger_id, opponent_id) VALUES (?, ?)').run(challengerId, opponentId);
  return { ok: true, war: getWar(info.lastInsertRowid) };
}
function acceptWar(id, opponentId) {
  const war = getWar(id);
  if (!war || war.opponent_id !== opponentId || war.status !== 'pending') return { ok: false, reason: 'invalid' };
  db.prepare("UPDATE wars SET status = 'active', accepted_at = datetime('now') WHERE id = ?").run(id);
  return { ok: true, war: getWar(id) };
}
function declineWar(id, opponentId) {
  const war = getWar(id);
  if (!war || war.opponent_id !== opponentId || war.status !== 'pending') return { ok: false, reason: 'invalid' };
  db.prepare("UPDATE wars SET status = 'declined', finished_at = datetime('now') WHERE id = ?").run(id);
  return { ok: true, war: getWar(id) };
}
function saveWarMove(warId, round, userId, choice) {
  const war = getWar(warId);
  if (!war || war.status !== 'active' || ![war.challenger_id, war.opponent_id].includes(userId)) return { ok: false, reason: 'invalid' };
  db.prepare('INSERT INTO war_moves (war_id, round, user_id, choice) VALUES (?, ?, ?, ?) ON CONFLICT(war_id, round, user_id) DO UPDATE SET choice = excluded.choice').run(warId, round, userId, choice);
  const moves = db.prepare('SELECT user_id, choice FROM war_moves WHERE war_id = ? AND round = ?').all(warId, round);
  return { ok: true, war: getWar(warId), moves, ready: moves.length === 2 };
}
function recordWarRound(id, userId, won) {
  const war = getWar(id);
  if (!war || war.status !== 'active') return { ok: false, reason: 'inactive' };
  if (![war.challenger_id, war.opponent_id].includes(userId)) return { ok: false, reason: 'not_player' };
  if (!won) return { ok: true, war };
  const field = userId === war.challenger_id ? 'challenger_score' : 'opponent_score';
  const nextScore = war[field] + 1;
  const finished = nextScore >= 3;
  if (finished) {
    db.prepare(`UPDATE wars SET ${field} = ?, status = 'finished', finished_at = datetime('now'), winner_id = ? WHERE id = ?`).run(nextScore, userId, id);
  } else {
    db.prepare(`UPDATE wars SET ${field} = ?, round = round + 1 WHERE id = ?`).run(nextScore, id);
  }
  return { ok: true, war: getWar(id), finished };
}
function activeWarForUser(userId) {
  return db.prepare("SELECT * FROM wars WHERE status IN ('pending','active') AND (challenger_id = ? OR opponent_id = ?) ORDER BY id DESC LIMIT 1").get(userId, userId);
}


// ---------- Admin / VIP users ----------
function highPointUsers(minPoints = 1000, limit = 100) {
  return db.prepare(`
    SELECT u.user_id, u.username, u.points, u.created_at,
           COALESCE(s.xp, 0) AS xp, COALESCE(s.level, 1) AS level
    FROM users u
    LEFT JOIN user_stats s ON s.user_id = u.user_id
    WHERE u.points >= ?
    ORDER BY u.points DESC, u.user_id ASC
    LIMIT ?
  `).all(Math.max(0, Number(minPoints) || 0), Math.max(1, Number(limit) || 100));
}

function addGiftPoints(userId, amount, reason = 'admin_gift', reference = '') {
  const user = getUser(userId);
  if (!user) return { ok: false, reason: 'user_not_found' };
  const value = Math.trunc(Number(amount));
  if (!Number.isFinite(value) || value <= 0) return { ok: false, reason: 'invalid_amount' };
  db.prepare('UPDATE users SET points = points + ? WHERE user_id = ?').run(value, userId);
  db.prepare('INSERT INTO point_transactions (user_id, amount, reason, reference) VALUES (?, ?, ?, ?)').run(userId, value, reason, reference || null);
  return { ok: true, user: getUser(userId), amount: value };
}

// ---------- Broadcast ----------
function listAllUserIds() {
  return db.prepare('SELECT user_id FROM users').all().map(r => r.user_id);
}

// ---------- CSV export ----------
function toCsv(rows, columns) {
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = columns.join(',');
  const body = rows.map(r => columns.map(c => esc(r[c])).join(',')).join('\n');
  return header + '\n' + body;
}

// ---------- Cooldown (in-memory, not persisted — resets on restart, which is fine) ----------
const lastActionAt = new Map();
function isOnCooldown(userId, key, ms) {
  const mapKey = `${userId}:${key}`;
  const now = Date.now();
  const last = lastActionAt.get(mapKey) || 0;
  if (now - last < ms) return true;
  lastActionAt.set(mapKey, now);
  return false;
}

module.exports = {
  db,
  createDrop, getDrop, listDrops, setChatMessageId, listClaims, countClaimsByUser, claimTxn,
  markScheduledPosted, listDueScheduledDrops, listExpiredUnnotifiedDrops, expireDrop,
  getOrCreateUser, getUser, listGameCompletions, awardPointTxn,
  createSession, getSession, updateSession,
  createTask, listActiveTasks, listAllTasks, getTask,
  getUserTaskStatus, getUserTaskStatuses, setUserTaskStatus, completeTaskTxn, listGameTasks, listCompletedChannelTaskUsers,
  setWhatsappConfirmed, createReview, setReviewAdminMessage, getReview, setReviewStatus, listPendingReviews,
  topUsers, getUserRank,
  recordReferral, rewardReferralTxn, countReferrals,
  listAllUserIds, toCsv, isOnCooldown,
  getStats, levelForXp, xpForNextLevel, touchActivity, addXpTxn, recordGameWin, ensureDailyChallenge, updateDailyChallenge, ACHIEVEMENTS, unlockAchievement, listAchievements, weeklyLeaderboard, openMysteryBoxTxn, statsSummary, referralMilestoneTxn, getActiveJackpot, createJackpot, addJackpotTicket, jackpotStatus, drawDueJackpotsTxn,
  findUserByUsername, highPointUsers, addGiftPoints, leagueForPoints, leagueLeaderboard, tournamentWeekKey, joinTournament, tournamentStatus, getWar, createWar, acceptWar, declineWar, saveWarMove, recordWarRound, activeWarForUser,
};
