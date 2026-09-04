# Hall of Fame — Profile Images

Hall of Fame entries should use the Telegram profile photo belonging to the
actual user represented by each Hall of Fame record.

Do NOT use an admin photo, bot photo, generic avatar, or the photo of the
person viewing the Hall of Fame.

For each entry:
1. Keep the Hall of Fame record's `userId`.
2. Call `getUserProfilePhotos(userId, { limit: 1 })`.
3. Select the largest returned photo size.
4. Send that `file_id` with the Hall of Fame caption.
5. If no photo is available, fall back to the normal TRC message.

The helper is in `src/features/hallOfFameProfile.js`.
