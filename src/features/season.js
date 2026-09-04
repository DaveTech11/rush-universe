// RUSH UNIVERSE V5 — SEASON / BATTLE PASS HELPERS

const TIERS = 50;

function levelForXp(xp) {
  return Math.max(1, Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1);
}

function battlePassTier(xp) {
  return Math.min(TIERS, Math.max(1, Math.floor(xp / 250) + 1));
}

module.exports = { TIERS, levelForXp, battlePassTier };
