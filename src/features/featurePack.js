// RUSH BOT ULTIMATE V4 — FEATURE PACK
// Tiny-caps should be applied to all user-facing labels/messages via ../tinyCaps.js.
// These modules are intentionally framework-light so they can be connected to the existing bot handlers.

class FeaturePack {
  constructor(store) {
    this.store = store;
  }

  // Daily login: returns the new streak and reward.
  dailyLogin(userId, now = new Date()) {
    const day = now.toISOString().slice(0,10);
    const u = this.store.getUser(userId);
    if (u.lastDaily === day) return { alreadyClaimed: true, ...u };
    const previous = u.lastDaily;
    const yesterday = new Date(now); yesterday.setUTCDate(yesterday.getUTCDate()-1);
    const isConsecutive = previous === yesterday.toISOString().slice(0,10);
    u.streak = isConsecutive ? (u.streak || 0) + 1 : 1;
    u.lastDaily = day;
    u.xp = (u.xp || 0) + Math.min(100, 10 + u.streak * 3);
    u.points = (u.points || 0) + Math.min(100, 10 + u.streak * 5);
    this.store.saveUser(u);
    return { alreadyClaimed:false, reward:u.points, ...u };
  }

  // Generic quest progress.
  progressQuest(userId, questId, amount=1) {
    const q = this.store.getQuest(userId, questId);
    q.progress = Math.min(q.target, (q.progress || 0) + amount);
    if (q.progress >= q.target && !q.completed) {
      q.completed = true;
      this.store.addPoints(userId, q.reward);
      this.store.addXp(userId, q.xpReward || Math.floor(q.reward/2));
    }
    this.store.saveQuest(userId, q);
    return q;
  }

  // Achievement unlock helper.
  unlock(userId, achievementId, reward=0) {
    if (this.store.hasAchievement(userId, achievementId)) return false;
    this.store.addAchievement(userId, achievementId);
    if (reward) this.store.addPoints(userId, reward);
    return true;
  }

  // Safe transfer: never allow negative balances.
  transfer(fromId, toId, amount) {
    amount = Math.floor(Number(amount));
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("INVALID_AMOUNT");
    if (this.store.getPoints(fromId) < amount) throw new Error("INSUFFICIENT_POINTS");
    this.store.addPoints(fromId, -amount);
    this.store.addPoints(toId, amount);
    this.store.logTransaction(fromId, "gift_sent", -amount, {toId});
    this.store.logTransaction(toId, "gift_received", amount, {fromId});
    return true;
  }
}

module.exports = { FeaturePack };
