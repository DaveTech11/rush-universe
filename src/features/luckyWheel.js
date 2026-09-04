// RUSH UNIVERSE V5 — LUCKY WHEEL
// Rewards are configurable by the caller. Selection uses weighted random.

function spinWeighted(rewards) {
  const valid = rewards.filter(r => Number(r.weight) > 0);
  const total = valid.reduce((s, r) => s + Number(r.weight), 0);
  if (!total) throw new Error("NO_WHEEL_REWARDS");
  let n = Math.random() * total;
  for (const reward of valid) {
    n -= Number(reward.weight);
    if (n <= 0) return reward;
  }
  return valid[valid.length - 1];
}

module.exports = { spinWeighted };
