// RUSH UNIVERSE V6 — SOCIAL, RANKED, SEASONS & PREMIUM PASS
const db = require('../db');

// Persistent tables; safe for existing databases.
db.db.exec(`
CREATE TABLE IF NOT EXISTS rush_clans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  owner_id INTEGER NOT NULL,
  level INTEGER NOT NULL DEFAULT 1,
  xp INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS rush_clan_members (
  clan_id INTEGER NOT NULL,
  user_id INTEGER PRIMARY KEY,
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(clan_id, user_id)
);
CREATE TABLE IF NOT EXISTS rush_ranked (
  user_id INTEGER PRIMARY KEY,
  rating INTEGER NOT NULL DEFAULT 1000,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  season_wins INTEGER NOT NULL DEFAULT 0,
  season_losses INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS rush_seasons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  season_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
);
CREATE TABLE IF NOT EXISTS rush_premium_rewards (
  user_id INTEGER PRIMARY KEY,
  season_key TEXT NOT NULL,
  claimed_tier INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS rush_feed (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  username TEXT,
  event TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

function seasonKey(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}
function ensureSeason() {
  const now = new Date();
  const key = seasonKey(now);
  let season = db.db.prepare('SELECT * FROM rush_seasons WHERE season_key = ?').get(key);
  if (season) return season;
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const name = `Season ${now.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' })} ${now.getUTCFullYear()}`;
  db.db.prepare('INSERT OR IGNORE INTO rush_seasons (season_key,name,starts_at,ends_at,status) VALUES (?,?,?,?,?)')
    .run(key, name, start.toISOString(), end.toISOString(), 'active');
  return db.db.prepare('SELECT * FROM rush_seasons WHERE season_key = ?').get(key);
}
function premiumIds() {
  return new Set(String(process.env.PREMIUM_USER_IDS || '').split(',').map(s => s.trim()).filter(Boolean));
}
function isPremium(userId) { return premiumIds().has(String(userId)); }

function profile(userId) {
  const u = db.getOrCreateUser(userId);
  const s = db.getStats(userId);
  const ranked = getRanked(userId);
  const clan = clanForUser(userId);
  const season = ensureSeason();
  const achievements = db.listAchievements(userId);
  return { u, s, ranked, clan, season, achievements, premium: isPremium(userId) };
}
function getRanked(userId) {
  db.db.prepare('INSERT OR IGNORE INTO rush_ranked (user_id) VALUES (?)').run(userId);
  return db.db.prepare('SELECT * FROM rush_ranked WHERE user_id = ?').get(userId);
}
function rankedTier(rating) {
  if (rating >= 2000) return { name: 'ʀᴜsʜ ʟᴇɢᴇɴᴅ', emoji: '🔥' };
  if (rating >= 1700) return { name: 'ᴅɪᴀᴍᴏɴᴅ', emoji: '👑' };
  if (rating >= 1450) return { name: 'ᴘʟᴀᴛɪɴᴜᴍ', emoji: '💎' };
  if (rating >= 1200) return { name: 'ɢᴏʟᴅ', emoji: '🥇' };
  if (rating >= 1000) return { name: 'sɪʟᴠᴇʀ', emoji: '🥈' };
  return { name: 'ʙʀᴏɴᴢᴇ', emoji: '🥉' };
}
function rankedLeaderboard(limit = 10) {
  return db.db.prepare(`SELECT r.*, u.username FROM rush_ranked r JOIN users u ON u.user_id=r.user_id ORDER BY r.rating DESC, r.wins DESC LIMIT ?`).all(limit);
}
function recordRankedResult(winnerId, loserId) {
  if (!winnerId || !loserId || winnerId === loserId) return null;
  const tx = db.db.transaction(() => {
    const w = getRanked(winnerId), l = getRanked(loserId);
    const expected = 1 / (1 + Math.pow(10, (l.rating - w.rating) / 400));
    const delta = Math.max(8, Math.round(32 * (1 - expected)));
    db.db.prepare(`UPDATE rush_ranked SET rating=rating+?, wins=wins+1, season_wins=season_wins+1, updated_at=datetime('now') WHERE user_id=?`).run(delta, winnerId);
    db.db.prepare(`UPDATE rush_ranked SET rating=MAX(100, rating-?), losses=losses+1, season_losses=season_losses+1, updated_at=datetime('now') WHERE user_id=?`).run(delta, loserId);
    return { winner: getRanked(winnerId), loser: getRanked(loserId), delta };
  });
  return tx();
}
function resetSeasonIfNeeded() {
  const season = ensureSeason();
  const now = Date.now();
  if (new Date(season.ends_at).getTime() > now) return season;
  const next = new Date(season.ends_at);
  const key = seasonKey(next);
  db.db.prepare("UPDATE rush_seasons SET status='ended' WHERE id=?").run(season.id);
  db.db.prepare('INSERT OR IGNORE INTO rush_seasons (season_key,name,starts_at,ends_at,status) VALUES (?,?,?,?,?)')
    .run(key, `Season ${next.toLocaleString('en-US',{month:'long',timeZone:'UTC'})} ${next.getUTCFullYear()}`, next.toISOString(), new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth()+1,1)).toISOString(), 'active');
  db.db.prepare('UPDATE rush_ranked SET season_wins=0, season_losses=0').run();
  return ensureSeason();
}

function clanForUser(userId) {
  return db.db.prepare(`SELECT c.*, cm.joined_at FROM rush_clans c JOIN rush_clan_members cm ON cm.clan_id=c.id WHERE cm.user_id=?`).get(userId) || null;
}
function createClan(userId, name) {
  const clean = String(name || '').trim().replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 24);
  if (clean.length < 3) return { ok:false, reason:'name' };
  if (clanForUser(userId)) return { ok:false, reason:'already' };
  try {
    const id = db.db.prepare('INSERT INTO rush_clans (name,owner_id) VALUES (?,?)').run(clean, userId).lastInsertRowid;
    db.db.prepare('INSERT INTO rush_clan_members (clan_id,user_id) VALUES (?,?)').run(id,userId);
    db.unlockAchievement(userId, 'clan_founder');
    return { ok:true, clan: db.db.prepare('SELECT * FROM rush_clans WHERE id=?').get(id) };
  } catch (_) { return { ok:false, reason:'taken' }; }
}
function joinClan(userId, clanId) {
  if (clanForUser(userId)) return { ok:false, reason:'already' };
  const clan = db.db.prepare('SELECT * FROM rush_clans WHERE id=?').get(clanId);
  if (!clan) return { ok:false, reason:'missing' };
  const n = db.db.prepare('SELECT COUNT(*) n FROM rush_clan_members WHERE clan_id=?').get(clanId).n;
  if (n >= 50) return { ok:false, reason:'full' };
  db.db.prepare('INSERT INTO rush_clan_members (clan_id,user_id) VALUES (?,?)').run(clanId,userId);
  return { ok:true, clan };
}
function leaveClan(userId) {
  const clan = clanForUser(userId);
  if (!clan) return false;
  db.db.prepare('DELETE FROM rush_clan_members WHERE user_id=?').run(userId);
  if (clan.owner_id === userId) {
    const next = db.db.prepare('SELECT user_id FROM rush_clan_members WHERE clan_id=? ORDER BY joined_at LIMIT 1').get(clan.id);
    if (next) db.db.prepare('UPDATE rush_clans SET owner_id=? WHERE id=?').run(next.user_id, clan.id);
    else db.db.prepare('DELETE FROM rush_clans WHERE id=?').run(clan.id);
  }
  return true;
}
function clanLeaderboard(limit=10) {
  return db.db.prepare(`SELECT c.*, (SELECT COUNT(*) FROM rush_clan_members m WHERE m.clan_id=c.id) members FROM rush_clans c ORDER BY c.xp DESC,c.wins DESC LIMIT ?`).all(limit);
}
function addClanXp(userId, amount=10) {
  const clan = clanForUser(userId); if (!clan) return null;
  const xp = clan.xp + Math.max(0, Number(amount)||0);
  const level = Math.max(1, Math.floor(Math.sqrt(xp / 100)) + 1);
  db.db.prepare('UPDATE rush_clans SET xp=?, level=? WHERE id=?').run(xp,level,clan.id);
  if (xp >= 1000) db.unlockAchievement(userId, 'clan_hero');
  return db.db.prepare('SELECT * FROM rush_clans WHERE id=?').get(clan.id);
}

function premiumPass(userId) {
  const season = ensureSeason();
  const stats = db.getStats(userId);
  const tier = Math.min(30, Math.floor(stats.xp / 250) + 1);
  db.db.prepare('INSERT OR IGNORE INTO rush_premium_rewards (user_id,season_key) VALUES (?,?)').run(userId,season.season_key);
  const row = db.db.prepare('SELECT * FROM rush_premium_rewards WHERE user_id=?').get(userId);
  return { season, tier, claimed: row.claimed_tier, premium: isPremium(userId) };
}
function claimPremiumTier(userId) {
  if (!isPremium(userId)) return { ok:false, reason:'premium' };
  const p = premiumPass(userId);
  if (p.tier <= p.claimed) return { ok:false, reason:'none', ...p };
  const reward = Math.min(500, 50 + p.tier * 15);
  db.db.transaction(() => {
    db.db.prepare('UPDATE rush_premium_rewards SET claimed_tier=? WHERE user_id=?').run(p.tier,userId);
    db.db.prepare('UPDATE users SET points=points+? WHERE user_id=?').run(reward,userId);
    db.db.prepare('INSERT INTO point_transactions (user_id,amount,reason,reference) VALUES (?,?,?,?)').run(userId,reward,'premium_pass',`${p.season.season_key}:${p.tier}`);
    db.addXpTxn(userId, 10, 'premium_pass');
    db.unlockAchievement(userId, 'premium_runner');
  })();
  return { ok:true, reward, tier:p.tier, ...premiumPass(userId) };
}
function addFeed(userId, username, event, detail='') {
  db.db.prepare('INSERT INTO rush_feed (user_id,username,event,detail) VALUES (?,?,?,?)').run(userId,username||null,event,detail||null);
}
function latestFeed(limit=12) { return db.db.prepare('SELECT * FROM rush_feed ORDER BY id DESC LIMIT ?').all(limit); }

module.exports = { seasonKey, ensureSeason, resetSeasonIfNeeded, isPremium, profile, getRanked, rankedTier, rankedLeaderboard, recordRankedResult, clanForUser, createClan, joinClan, leaveClan, clanLeaderboard, addClanXp, premiumPass, claimPremiumTier, addFeed, latestFeed };
