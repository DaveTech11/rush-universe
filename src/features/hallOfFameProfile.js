// RUSH UNIVERSE V5 — HALL OF FAME PROFILE PHOTOS
// Uses Telegram's getUserProfilePhotos so Hall of Fame entries can display
// the actual Telegram profile photo of the user being ranked.

async function getHallOfFamePhoto(bot, userId) {
  try {
    const photos = await bot.getUserProfilePhotos(userId, { limit: 1 });
    if (!photos || !photos.total_count || !photos.photos?.length) return null;

    // Telegram returns sizes for the same profile photo. Use the largest size.
    const sizes = photos.photos[0];
    return sizes[sizes.length - 1]?.file_id || null;
  } catch (err) {
    console.error("Hall of Fame profile photo error:", err.message);
    return null;
  }
}

async function sendHallOfFameEntry(bot, chatId, entry, caption, options = {}) {
  const photo = await getHallOfFamePhoto(bot, entry.userId);

  if (photo) {
    return bot.sendPhoto(chatId, photo, {
      caption,
      parse_mode: "HTML",
      ...options
    });
  }

  // Graceful fallback when the user has no accessible profile photo.
  return bot.sendMessage(chatId, caption, {
    parse_mode: "HTML",
    ...options
  });
}

module.exports = {
  getHallOfFamePhoto,
  sendHallOfFameEntry
};
