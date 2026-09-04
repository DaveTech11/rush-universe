// RUSH UNIVERSE V5 — CLANS / CLAN WAR HELPERS

function createClan(name, ownerId) {
  return {
    name: String(name).trim().slice(0, 32),
    ownerId,
    members: [ownerId],
    points: 0,
    wins: 0,
    losses: 0,
    createdAt: new Date().toISOString()
  };
}

function canJoinClan(clan, userId) {
  return !clan.members.includes(userId) && clan.members.length < 50;
}

module.exports = { createClan, canJoinClan };
