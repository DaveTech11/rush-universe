// RUSH UNIVERSE V5 — PvP / ELO / SEASON HELPERS

function expectedScore(a, b) {
  return 1 / (1 + Math.pow(10, (b - a) / 400));
}

function updateElo(ratingA, ratingB, resultA, k = 32) {
  const ea = expectedScore(ratingA, ratingB);
  const eb = 1 - ea;
  const resultB = 1 - resultA;
  return {
    a: Math.round(ratingA + k * (resultA - ea)),
    b: Math.round(ratingB + k * (resultB - eb))
  };
}

function createMatch(playerA, playerB, mode="best_of_3") {
  return {
    id: `match_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
    playerA, playerB, mode,
    scoreA: 0, scoreB: 0,
    status: "pending",
    createdAt: new Date().toISOString()
  };
}

module.exports = { expectedScore, updateElo, createMatch };
