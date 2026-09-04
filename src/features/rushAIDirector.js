// RUSH UNIVERSE V5 — RUSH AI DIRECTOR
// Framework-neutral event engine. Connect its store methods to your existing DB.

class RushAIDirector {
  constructor(store) { this.store = store; }

  activitySnapshot() {
    return this.store.getActivitySnapshot();
  }

  shouldBoost(snapshot) {
    return snapshot.activePlayers < snapshot.targetActivePlayers ||
           snapshot.gamesToday < snapshot.targetGamesToday;
  }

  createBoostIfNeeded() {
    const s = this.activitySnapshot();
    if (!this.shouldBoost(s)) return null;

    const event = {
      type: "XP_BOOST",
      multiplier: 2,
      durationMinutes: 60,
      reason: "LOW_ACTIVITY",
      createdAt: new Date().toISOString()
    };

    return this.store.createEvent(event);
  }

  closeExpiredEvents(now = new Date()) {
    return this.store.closeExpiredEvents(now);
  }
}

module.exports = { RushAIDirector };
