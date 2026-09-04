const { Telegraf, Markup } = require('telegraf');

// Telegram Bot API supports styled inline buttons: primary (blue), success (green), danger (red).
// We use raw InlineKeyboardButton objects so this also works with older Telegraf releases.
function buttonStyle(text = '', action = '') {
  const value = `${text} ${action}`.toLowerCase();
  if (/delete|remove|ban|block|cancel|decline|leave|logout|withdraw|danger|reset|reject|close/.test(value)) return 'danger';
  if (/play|join|buy|claim|confirm|start|accept|approve|send|deposit|add|create|save|submit|upgrade|gift|invite|request/.test(value)) return 'success';
  return 'primary';
}

function styledCallback(text, data, style) {
  return { text, callback_data: data, style: style || buttonStyle(text, data) };
}

function styledUrl(text, url, style) {
  return { text, url, style: style || buttonStyle(text, url) };
}

const { customAlphabet } = require('nanoid');
const db = require('./db');
const tasksLib = require('./tasks');
const ttt = require('./games/tictactoe');
const rps = require('./games/rps');
const chessPuzzle = require('./games/chessPuzzle');
const pictureQuiz = require('./games/pictureQuiz');
const wordScramble = require('./games/wordScramble');
const memoryMatch = require('./games/memoryMatch');
const shooterGames = require('./games/shooterGames');
const bombArena = require('./games/bombArena');
const { escapeHtml, trc, table, code, quote } = require('./richText');
const { tiny } = require('./tinyCaps');
const social = require('./features/rushSocial');
const economy = require('./economyStore');
const rushV10 = require('./rushV10');

const genCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 8);

if (!process.env.BOT_TOKEN) {
  throw new Error('Missing BOT_TOKEN in environment');
}

const bot = new Telegraf(process.env.BOT_TOKEN);

// ============================================================
// TELEGRAM MESSAGE EDIT COMPATIBILITY
// Many RUSH menus can originate from a photo message (MENU_IMAGE_URL),
// while older handlers call editMessageText(). Telegram rejects that with
// "there is no text in the message", which used to make buttons appear to
// disappear. These wrappers transparently switch between caption/text and,
// as a last resort, send a fresh message with the requested keyboard.
// ============================================================
function isEditCompatibilityError(err) {
  const msg = String(err?.description || err?.message || '').toLowerCase();
  return msg.includes('there is no text in the message') ||
    msg.includes("message can't be edited") ||
    msg.includes('message to edit not found') ||
    msg.includes('message identifier is not specified');
}

bot.use(async (ctx, next) => {
  if (ctx.__rushEditPatched) return next();
  ctx.__rushEditPatched = true;

  const rawEditText = typeof ctx.editMessageText === 'function' ? ctx.editMessageText.bind(ctx) : null;
  const rawEditCaption = typeof ctx.editMessageCaption === 'function' ? ctx.editMessageCaption.bind(ctx) : null;

  if (rawEditText) {
    ctx.editMessageText = async (text, extra = {}) => {
      try {
        return await rawEditText(text, extra);
      } catch (err) {
        if (!isEditCompatibilityError(err)) throw err;
        if (rawEditCaption) {
          try { return await rawEditCaption(text, extra); } catch (_) {}
        }
        if (typeof ctx.reply === 'function') return ctx.reply(text, extra);
        throw err;
      }
    };
  }

  if (rawEditCaption) {
    ctx.editMessageCaption = async (caption, extra = {}) => {
      try {
        return await rawEditCaption(caption, extra);
      } catch (err) {
        if (!isEditCompatibilityError(err)) throw err;
        if (rawEditText) {
          try { return await rawEditText(caption, extra); } catch (_) {}
        }
        if (typeof ctx.reply === 'function') return ctx.reply(caption, extra);
        throw err;
      }
    };
  }

  return next();
});

// ============================================================
// GLOBAL ERROR SHIELD
// A single broken update/action should never bring the whole bot down.
// Errors are logged and the bot continues processing the next update.
// ============================================================
function safeError(label, err) {
  try {
    console.error(`[RUSH SAFE ERROR] ${label}:`, err?.stack || err?.message || err);
  } catch (_) {}
}

bot.catch((err, ctx) => {
  safeError(`update ${ctx?.update?.update_id || 'unknown'}`, err);
  try { ctx?.answerCbQuery?.().catch?.(() => {}); } catch (_) {}
});

const awaitingScreenshot = new Map();
const awaitingAdminGift = new Map();
const awaitingStoreFile = new Map();

// ============================================================
// ADMIN / HIGH-POINT PLAYER CENTER
// Admins are explicitly configured with ADMIN_USER_IDS. High-point
// players are visible to admins and can receive points or any Telegram
// message/file as a gift (documents, ZIPs, photos, videos, audio, etc.).
// ============================================================
function adminIds() {
  return new Set(String(process.env.ADMIN_USER_IDS || '').split(',').map(v => v.trim()).filter(Boolean));
}
function isAdmin(userId) {
  return adminIds().has(String(userId));
}
function adminMinPoints() {
  return Math.max(0, Number(process.env.ADMIN_HIGH_POINTS || 1000));
}
function adminGuard(ctx) {
  if (isAdmin(ctx.from?.id)) return true;
  ctx.answerCbQuery?.(tiny('ᴀᴅᴍɪɴ ᴏɴʟʏ.'), { show_alert: true }).catch(() => {});
  return false;
}

// ============================================================
// MAINTENANCE MODE — ADMIN ONLY
// Admins can always use the bot while maintenance mode is enabled.
// Other players receive a maintenance notice and their update is ignored.
// Use /maintenance on or /maintenance off.
// ============================================================
let maintenanceMode = /^(1|true|yes|on)$/i.test(String(process.env.MAINTENANCE_MODE || 'false'));

function maintenanceNotice() {
  return tiny('🛠️ ʀᴜsʜ ɪs ᴄᴜʀʀᴇɴᴛʟʏ ᴜɴᴅᴇʀ ᴍᴀɪɴᴛᴇɴᴀɴᴄᴇ.\n\n⏳ ᴡᴇ ᴀʀᴇ ᴜᴘᴅᴀᴛɪɴɢ ᴛʜᴇ ʙᴏᴛ.\n🔔 ᴘʟᴇᴀsᴇ ᴛʀʏ ᴀɢᴀɪɴ sᴏᴏɴ.');
}

bot.use(async (ctx, next) => {
  if (!maintenanceMode || isAdmin(ctx.from?.id)) return next();
  try {
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery(tiny('🛠️ ᴍᴀɪɴᴛᴇɴᴀɴᴄᴇ ᴍᴏᴅᴇ'), { show_alert: true }).catch(() => {});
    } else if (ctx.chat?.id) {
      await ctx.reply(maintenanceNotice()).catch(() => {});
    }
  } catch (err) { safeError('maintenance gate', err); }
  return;
});
function adminPlayerLabel(user) {
  const name = user.username ? `@${escapeHtml(user.username)}` : tiny('ɴᴏ ᴜsᴇʀɴᴀᴍᴇ');
  return `${name} · <code>${user.user_id}</code> · 💰 ${user.points} pts`;
}
function adminCenterText() {
  const users = db.highPointUsers(adminMinPoints(), 25);
  const lines = users.length
    ? users.map((u, i) => `${i + 1}. ${adminPlayerLabel(u)} · ⭐ Lv.${u.level}`)
    : [tiny('ɴᴏ ᴘʟᴀʏᴇʀs ʜɪᴛ ᴛʜᴇ ʜɪɢʜ-ᴘᴏɪɴᴛ ᴛʜʀᴇsʜᴏʟᴅ ʏᴇᴛ.')];
  return trc({
    title: 'ʀᴜsʜ ᴀᴅᴍɪɴ ᴄᴇɴᴛᴇʀ', emoji: '👑',
    intro: `ᴘʟᴀʏᴇʀs ᴡɪᴛʜ <b>${adminMinPoints()}+</b> ᴘᴏɪɴᴛs ᴀʀᴇ sʜᴏᴡɴ ʜᴇʀᴇ.`,
    sections: [
      { title: 'High-Point Players', emoji: '💰', items: lines },
      { title: 'Gifts', emoji: '🎁', items: [tiny('ɢɪᴠᴇ ᴘᴏɪɴᴛs ᴡɪᴛʜ /ɢɪғᴛᴘᴏɪɴᴛs <ɪᴅ> <ᴀᴍᴏᴜɴᴛ>.'), tiny('ɢɪᴠᴇ ᴀɴʏ ᴛᴇʟᴇɢʀᴀᴍ ᴍᴇssᴀɢᴇ, ғɪʟᴇ, ᴢɪᴘ, ᴘʜᴏᴛᴏ, ᴠɪᴅᴇᴏ, ᴀᴜᴅɪᴏ ᴏʀ ᴅᴏᴄᴜᴍᴇɴᴛ ᴡɪᴛʜ /ɢɪғᴛ <ɪᴅ> ᴛʜᴇɴ sᴇɴᴅ ᴛʜᴇ ɢɪғᴛ.'), tiny('ᴛʜᴇ ʙᴏᴛ ᴄᴏᴘɪᴇs ᴛʜᴇ ɢɪғᴛ ᴛᴏ ᴛʜᴇ ᴘʟᴀʏᴇʀ.') ] }
    ],
    footer: tiny('ᴋᴇᴇᴘ ᴀᴅᴍɪɴ_ᴜsᴇʀ_ɪᴅs ᴘʀɪᴠᴀᴛᴇ.')
  });
}

// ============================================================
// ANTI-SPAM: throttle callback taps per user so rapid-fire clicking
// (rush drops especially) can't hammer the bot/DB.
// ============================================================
bot.use(async (ctx, next) => {
  if (ctx.callbackQuery && ctx.from) {
    const data = ctx.callbackQuery.data || '';
    if (data !== 'noop' && db.isOnCooldown(ctx.from.id, 'cb', 350)) {
      return ctx.answerCbQuery().catch(() => {});
    }
  }
  return next();
});

// ============================================================
// FORCE-JOIN + WHATSAPP GATEWAY
// Telegram channels are verified with getChatMember. WhatsApp membership
// cannot be verified through Telegram/WhatsApp public APIs, so WhatsApp is
// a required join step with a user confirmation button.
// ============================================================
function gatewayChannels() {
  const raw = process.env.GATEWAY_CHANNELS || process.env.GATEWAY_CHANNEL || '';
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

function channelLink(channel) {
  if (channel.startsWith('@')) return `https://t.me/${channel.slice(1)}`;
  return null;
}

async function checkGate(userId) {
  const channels = gatewayChannels();
  const waRequired = !!process.env.WHATSAPP_GROUP_LINK;
  const channelResults = [];
  for (const ch of channels) {
    channelResults.push({ channel: ch, ok: await tasksLib.isTelegramMember(bot, ch, userId) });
  }
  const user = db.getOrCreateUser(userId);
  const waOk = waRequired ? !!user.whatsapp_confirmed : true;
  return { channelResults, waRequired, waOk, ok: channelResults.every(c => c.ok) && waOk };
}

function gateKeyboard(gate) {
  const rows = [];
  for (const c of gate.channelResults) {
    const link = channelLink(c.channel);
    if (link) rows.push([styledUrl(`${c.ok ? '✅' : '📢'} ${tiny(`Join ${c.channel}`)}`, link)]);
  }
  if (gate.waRequired) {
    rows.push([styledUrl(gate.waOk ? `✅ ${tiny('WhatsApp Joined')}` : `🟢 ${tiny('Join WhatsApp')}`, process.env.WHATSAPP_GROUP_LINK)]);
    if (!gate.waOk) rows.push([styledCallback(`✅ ${tiny("I've Joined WhatsApp")}`, 'gate_wa')]);
  }
  rows.push([styledCallback(`🔄 ${tiny('Check Access')}`, 'gate_check')]);
  return Markup.inlineKeyboard(rows);
}

function gateText(gate) {
  const lines = [
    `🔐 <b>${tiny('RUSH ACCESS GATEWAY')}</b>`,
    '',
    tiny('Join the required communities below to unlock the bot.'),
    ''
  ];
  for (const c of gate.channelResults) lines.push(`${c.ok ? '✅' : '❌'} <b>${escapeHtml(c.channel)}</b> ${c.ok ? tiny('verified') : tiny('required')}`);
  if (gate.waRequired) lines.push(`${gate.waOk ? '✅' : '❌'} <b>WhatsApp</b> ${gate.waOk ? tiny('confirmed') : tiny('required')}`);
  lines.push('', gate.ok ? `🎉 <b>${tiny('ACCESS GRANTED')}</b>` : `⚠️ <b>${tiny('COMPLETE ALL STEPS THEN TAP CHECK ACCESS')}</b>`);
  return lines.join('\n');
}

async function sendGate(ctx, gate, isEdit = false) {
  const text = gateText(gate);
  const opts = { parse_mode: 'HTML', ...gateKeyboard(gate) };
  const image = process.env.GATEWAY_IMAGE_URL;
  if (!isEdit && image) return ctx.replyWithPhoto(image, { caption: text, ...opts }).catch(() => ctx.reply(text, opts));
  if (isEdit) return ctx.editMessageText(text, opts).catch(() => ctx.reply(text, opts));
  return ctx.reply(text, opts);
}

bot.use(async (ctx, next) => {
  if (!ctx.from) return next();
  const data = ctx.callbackQuery?.data || '';
  if (data.startsWith('gate_') || data.startsWith('review_')) return next();
  db.getOrCreateUser(ctx.from.id, ctx.from.username || ctx.from.first_name);
  const gate = await checkGate(ctx.from.id);
  if (!gate.ok) {
    if (ctx.callbackQuery) await ctx.answerCbQuery(tiny('Complete the join steps first.'), { show_alert: true }).catch(() => {});
    await sendGate(ctx, gate);
    return;
  }
  return next();
});

bot.action('gate_wa', async (ctx) => {
  db.setWhatsappConfirmed(ctx.from.id, ctx.from.username || ctx.from.first_name, true);
  await ctx.answerCbQuery(tiny('WhatsApp join confirmed.')).catch(() => {});
  const gate = await checkGate(ctx.from.id);
  if (gate.ok) return showMainMenu(ctx, true);
  return sendGate(ctx, gate, true);
});

bot.action('gate_check', async (ctx) => {
  const gate = await checkGate(ctx.from.id);
  await ctx.answerCbQuery(gate.ok ? tiny('Access granted!') : tiny('Some join steps are still missing.'), { show_alert: !gate.ok }).catch(() => {});
  if (gate.ok) return showMainMenu(ctx, true);
  return sendGate(ctx, gate, true);
});

// ============================================================
// REFERRALS — deep link is t.me/<bot>?start=<referrerUserId>.
// Reward is given immediately when a new, previously-unreferred user starts
// the bot via that link. Simple by design — not abuse-proof, just straightforward.
// ============================================================

async function handleReferral(ctx) {
  const payload = ctx.startPayload;
  if (!payload || !/^\d+$/.test(payload)) return;
  const referrerId = Number(payload);
  if (referrerId === ctx.from.id) return;
  const referrer = db.getUser(referrerId);
  if (!referrer) return;
  const ref = db.recordReferral(referrerId, ctx.from.id);
  if (!ref) return; // already referred previously
  db.rewardReferralTxn(ctx.from.id);
  const milestones = db.referralMilestoneTxn(referrerId);
  try {
    await bot.telegram.sendMessage(referrerId, `🎉 <b>New referral!</b> Someone joined using your referral link — <b>+1 point</b>!${milestones.length ? `\n\n🏅 Milestone bonus: <b>+${milestones.reduce((n, m) => n + m.reward, 0)} points</b>` : ''}`, { parse_mode: 'HTML' });
  } catch (e) { /* ignore */ }
}

// ============================================================
// MAIN MENU
// ============================================================

function mainMenuKeyboard() {
  return Markup.inlineKeyboard([
    [styledCallback('🎮 Play Games', 'nav_games')],
    [styledCallback('⚔️ War / PvP', 'nav_war')],
    [styledCallback('📋 Tasks', 'nav_tasks')],
    [styledCallback('🏆 My Points', 'nav_points'), styledCallback('🏦 ᴡᴀʟʟᴇᴛ / ʙᴀɴᴋ', 'nav_wallet')],
    [styledCallback('🔥 Streak & XP', 'nav_profile')],
    [styledCallback('🎯 Daily Challenge', 'nav_challenge')],
    [styledCallback('🎁 Mystery Box', 'nav_mystery')],
    [styledCallback('🛒 ʀᴜsʜ sᴛᴏʀᴇ', 'nav_store')],
    [styledCallback('🎰 Jackpot', 'nav_jackpot')],
    [styledCallback('🏆 Leaderboards', 'nav_leaderboard')],
    [styledCallback('👑 Rush League', 'nav_league')],
    [styledCallback('🏟️ Weekly Tournament', 'nav_tournament')],
    [styledCallback('🔥 Daily Rush', 'nav_daily_rush')],
    [styledCallback('👤 My Profile', 'nav_full_profile'), styledCallback('⚔️ Ranked', 'nav_ranked')],
    [styledCallback('🛡️ Clans', 'nav_clans'), styledCallback('💎 Premium Pass', 'nav_premium_pass')],
    [styledCallback('🌎 Live Rush Feed', 'nav_feed')],
    [styledCallback('🎒 ɪɴᴠᴇɴᴛᴏʀʏ', 'nav_inventory'), styledCallback('🎁 ɢɪғᴛs', 'nav_gifts')],
    [styledCallback('🔄 ᴛʀᴀᴅɪɴɢ', 'nav_trading'), styledCallback('📈 ᴇᴄᴏɴᴏᴍʏ ʟᴇᴀᴅᴇʀʙᴏᴀʀᴅ', 'nav_economy')],
    [styledCallback('🎟️ ʙᴀᴛᴛʟᴇ ᴘᴀss', 'nav_battle_pass'), styledCallback('🎁 ᴅᴀɪʟʏ ʀᴇᴡᴀʀᴅ', 'nav_daily_reward')],
    [styledCallback('🗺️ ʀᴜsʜ ᴡᴏʀʟᴅ', 'nav_world'), styledCallback('⚔️ ʙᴀᴛᴛʟᴇ ᴄʟᴀss', 'nav_classes')],
    [styledCallback('🐾 ᴘᴇᴛs & ᴄᴏʟʟᴇᴄᴛɪᴏɴs', 'nav_pets'), styledCallback('🎮 ᴍɪɴɪ ɢᴀᴍᴇs', 'nav_minigames')],
    [styledCallback('🎉 ʟɪᴠᴇ ᴇᴠᴇɴᴛ', 'nav_event')],
    [styledCallback('🏅 Achievements', 'nav_achievements')],
    [styledCallback('🔗 My Referral Link', 'nav_referral')],
  ]);
}

async function showMainMenu(ctx, isEdit) {
  const text = trc({
    title: 'Main Menu',
    emoji: '🏠',
    intro: 'Play games to earn points, knock out tasks, or check the leaderboard.',
    sections: [{ title: 'Quick Access', emoji: '⚡', items: ['🎮 Play games', '📋 Complete tasks', '🏆 Track your points', '📊 View the leaderboard', '🔗 Share your referral link'] }],
    footer: 'Choose an option below to get started.',
  });
  const opts = { parse_mode: 'HTML', ...mainMenuKeyboard() };
  const menuImage = process.env.MENU_IMAGE_URL;
  if (menuImage && !isEdit) return ctx.replyWithPhoto(menuImage, { caption: text, ...opts }).catch(() => ctx.reply(text, opts));
  if (isEdit) return ctx.editMessageText(text, opts).catch(() => ctx.reply(text, opts));
  return ctx.reply(text, opts);
}

bot.start(async (ctx) => {
  await handleReferral(ctx);
  return showMainMenu(ctx, false);
});
bot.action('nav_home', (ctx) => showMainMenu(ctx, true));

// ============================================================
// WALLET / BANK / TRANSFERS / WITHDRAWAL REQUESTS
// Points are an in-bot virtual currency. Withdrawal requests are
// recorded for admin review; the bot does not promise real-cash payout.
// ============================================================
function walletText(userId) {
  const u=db.getUser(userId); const b=economy.bank(userId);
  return trc({title:'ʀᴜsʜ ᴡᴀʟʟᴇᴛ & ʙᴀɴᴋ',emoji:'🏦',intro:tiny('ᴍᴀɴᴀɢᴇ ʏᴏᴜʀ ʀᴜsʜ ᴘᴏɪɴᴛs.'),sections:[{title:'Balance',emoji:'💰',content:`ᴡᴀʟʟᴇᴛ: <b>${u.points} ᴘᴛs</b>\nʙᴀɴᴋ: <b>${b.balance} ᴘᴛs</b>`},{title:'Actions',emoji:'⚡',items:[tiny('ᴅᴇᴘᴏsɪᴛ ᴘᴏɪɴᴛs ɪɴᴛᴏ ʙᴀɴᴋ.'),tiny('ᴡɪᴛʜᴅʀᴀᴡ ʙᴀɴᴋ ᴘᴏɪɴᴛs ʙᴀᴄᴋ ᴛᴏ ᴡᴀʟʟᴇᴛ.'),tiny('ᴛʀᴀɴsғᴇʀ ᴘᴏɪɴᴛs ᴛᴏ ᴀɴᴏᴛʜᴇʀ ᴘʟᴀʏᴇʀ.'),tiny('ᴡɪᴛʜᴅʀᴀᴡᴀʟ ʀᴇǫᴜᴇsᴛs ɢᴏ ᴛᴏ ᴀᴅᴍɪɴ ʀᴇᴠɪᴇᴡ.')]}],footer:tiny('ᴘᴏɪɴᴛs ᴀʀᴇ ᴠɪʀᴛᴜᴀʟ ʀᴜsʜ ᴄᴜʀʀᴇɴᴄʏ.')});
}
async function showWallet(ctx,edit=true){const kb=Markup.inlineKeyboard([[styledCallback('➕ ᴅᴇᴘᴏsɪᴛ','wallet_deposit'),styledCallback('➖ ᴡɪᴛʜᴅʀᴀᴡ','wallet_withdraw')],[styledCallback('🔄 ᴛʀᴀɴsғᴇʀ','wallet_transfer'),styledCallback('💸 ᴄᴀsʜᴏᴜᴛ ʀᴇǫᴜᴇsᴛ','wallet_cashout')],[styledCallback('🛒 sᴛᴏʀᴇ','nav_store')],[styledCallback('⬅️ ʙᴀᴄᴋ','nav_home')]]);if(edit)return ctx.editMessageText(walletText(ctx.from.id),{parse_mode:'HTML',...kb}).catch(()=>ctx.reply(walletText(ctx.from.id),{parse_mode:'HTML',...kb}));return ctx.reply(walletText(ctx.from.id),{parse_mode:'HTML',...kb});}
bot.action('nav_wallet',ctx=>showWallet(ctx,true));
bot.command('wallet',ctx=>showWallet(ctx,false));
const awaitingWalletInput=new Map();
function walletPrompt(ctx,mode){awaitingWalletInput.set(ctx.from.id,mode);const msg=mode==='transfer'?tiny('ᴇɴᴛᴇʀ: /ᴛʀᴀɴsғᴇʀ <ᴜsᴇʀ_ɪᴅ|@ᴜsᴇʀɴᴀᴍᴇ> <ᴀᴍᴏᴜɴᴛ>'):mode==='cashout'?tiny('ᴇɴᴛᴇʀ: /ᴄᴀsʜᴏᴜᴛ <ᴀᴍᴏᴜɴᴛ> [ɴᴏᴛᴇ]'):tiny(`ᴇɴᴛᴇʀ: /${mode} <ᴀᴍᴏᴜɴᴛ>`);return ctx.reply(msg);}
bot.action('wallet_deposit',ctx=>walletPrompt(ctx,'deposit'));
bot.action('wallet_withdraw',ctx=>walletPrompt(ctx,'withdraw'));
bot.action('wallet_transfer',ctx=>walletPrompt(ctx,'transfer'));
bot.action('wallet_cashout',ctx=>walletPrompt(ctx,'cashout'));
bot.command('deposit',ctx=>{const a=Number(ctx.message.text.trim().split(/\s+/)[1]);const r=economy.deposit(ctx.from.id,a);return ctx.reply(tiny(r.ok?`🏦 ᴅᴇᴘᴏsɪᴛᴇᴅ ${r.amount||a} ᴘᴛs. ʙᴀɴᴋ: ${r.balance}.`:(r.reason==='points'?'❌ ɴᴏᴛ ᴇɴᴏᴜɢʜ ᴡᴀʟʟᴇᴛ ᴘᴏɪɴᴛs.':'❌ ᴇɴᴛᴇʀ ᴀ ᴠᴀʟɪᴅ ᴀᴍᴏᴜɴᴛ.')))}); 
bot.command('withdraw',ctx=>{const a=Number(ctx.message.text.trim().split(/\s+/)[1]);const r=economy.withdrawBank(ctx.from.id,a);return ctx.reply(tiny(r.ok?`💰 ᴡɪᴛʜᴅʀᴇᴡ ${a} ᴘᴛs. ᴡᴀʟʟᴇᴛ: ${r.user.points}.`:(r.reason==='bank'?'❌ ɴᴏᴛ ᴇɴᴏᴜɢʜ ʙᴀɴᴋ ᴘᴏɪɴᴛs.':'❌ ᴇɴᴛᴇʀ ᴀ ᴠᴀʟɪᴅ ᴀᴍᴏᴜɴᴛ.')))});
bot.command('transfer',ctx=>{const p=ctx.message.text.trim().split(/\s+/).slice(1);if(p.length<2)return ctx.reply(tiny('ᴜsᴇ: /ᴛʀᴀɴsғᴇʀ <ɪᴅ|@ᴜsᴇʀɴᴀᴍᴇ> <ᴀᴍᴏᴜɴᴛ>'));const target=/^\d+$/.test(p[0])?db.getUser(Number(p[0])):db.findUserByUsername(p[0]);if(!target)return ctx.reply(tiny('❌ ᴜsᴇʀ ɴᴏᴛ ғᴏᴜɴᴅ.'));const r=economy.transfer(ctx.from.id,target.user_id,Number(p[1]));return ctx.reply(tiny(r.ok?`🔄 ᴛʀᴀɴsғᴇʀʀᴇᴅ ${r.amount} ᴘᴛs ᴛᴏ ${target.username?'@'+target.username:target.user_id}.`:(r.reason==='points'?'❌ ɴᴏᴛ ᴇɴᴏᴜɢʜ ᴘᴏɪɴᴛs.':r.reason==='self'?'❌ ʏᴏᴜ ᴄᴀɴɴᴏᴛ ᴛʀᴀɴsғᴇʀ ᴛᴏ ʏᴏᴜʀsᴇʟғ.':'❌ ᴛʀᴀɴsғᴇʀ ғᴀɪʟᴇᴅ.')))});
bot.command('cashout',ctx=>{const p=ctx.message.text.trim().split(/\s+/).slice(1);const r=economy.requestWithdrawal(ctx.from.id,Number(p[0]),p.slice(1).join(' '));return ctx.reply(tiny(r.ok?`💸 ʀᴇǫᴜᴇsᴛ #${r.id} sᴜʙᴍɪᴛᴛᴇᴅ ғᴏʀ ${p[0]} ᴘᴛs. ᴀᴅᴍɪɴ ʀᴇᴠɪᴇᴡ ɪs ʀᴇǫᴜɪʀᴇᴅ.`:(r.reason==='bank'?'❌ ɴᴏᴛ ᴇɴᴏᴜɢʜ ʙᴀɴᴋ ᴘᴏɪɴᴛs.':'❌ ᴇɴᴛᴇʀ ᴀ ᴠᴀʟɪᴅ ᴀᴍᴏᴜɴᴛ.')))});

// ============================================================
// ʀᴜsʜ sᴛᴏʀᴇ — 50+ categories, 150 seeded virtual items
// ============================================================
function storeText(){return trc({title:'ʀᴜsʜ sᴛᴏʀᴇ',emoji:'🛒',intro:tiny('ʙᴜʏ ʀᴜsʜ ɪᴛᴇᴍs ᴡɪᴛʜ ʏᴏᴜʀ ᴘᴏɪɴᴛs.'),sections:[{title:'ᴄᴀᴛᴇɢᴏʀɪᴇs',emoji:'📦',content:`<b>${economy.getCategories().length}+</b> ᴄᴀᴛᴇɢᴏʀɪᴇs · <b>${economy.CATEGORIES.length*3}</b> sᴇᴇᴅᴇᴅ ɪᴛᴇᴍs`},{title:'ᴘᴀʏᴍᴇɴᴛ',emoji:'💰',content:tiny('ᴜsᴇ ᴘᴏɪɴᴛs ғʀᴏᴍ ʏᴏᴜʀ ᴡᴀʟʟᴇᴛ.') }],footer:tiny('sᴇʟᴇᴄᴛ ᴀ ᴄᴀᴛᴇɢᴏʀʏ ᴛᴏ ʙʀᴏᴡsᴇ.')});}
function storeKb(page=0){const cats=economy.getCategories();const per=10;const slice=cats.slice(page*per,(page+1)*per);const rows=slice.map(c=>[styledCallback(`📦 ${c.name}`,`store_cat:${c.id}:${page}`)]);const nav=[];if(page>0)nav.push(styledCallback('⬅️','store_page:'+(page-1)));if((page+1)*per<cats.length)nav.push(styledCallback('➡️','store_page:'+(page+1)));if(nav.length)rows.push(nav);rows.push([styledCallback('🏦 ᴡᴀʟʟᴇᴛ','nav_wallet'),styledCallback('⬅️ ʙᴀᴄᴋ','nav_home')]);return Markup.inlineKeyboard(rows);}
bot.action('nav_store',async ctx=>{await ctx.editMessageText(storeText(),{parse_mode:'HTML',...storeKb(0)}).catch(()=>{});await ctx.answerCbQuery().catch(()=>{});});
bot.command('store',async ctx=>ctx.reply(storeText(),{parse_mode:'HTML',...storeKb(0)}));
bot.action(/^store_page:(\d+)$/,async ctx=>{const p=Number(ctx.match[1]);await ctx.editMessageText(storeText(),{parse_mode:'HTML',...storeKb(p)}).catch(()=>{});await ctx.answerCbQuery().catch(()=>{});});
bot.action(/^store_cat:(\d+):(\d+)$/,async ctx=>{const cat=Number(ctx.match[1]),page=Number(ctx.match[2]);const c=economy.getCategories().find(x=>x.id===cat);if(!c)return;const ps=economy.getProducts(cat);const rows=ps.map(p=>[styledCallback(`🛍️ ${p.name} · ${p.price}ᴘ`, `store_buy:${p.id}:${page}:${cat}`)]);rows.push([styledCallback('🛒 ᴀᴅᴅ ᴛᴏ ᴄᴀʀᴛ','store_cart_help'),styledCallback('⬅️ ᴄᴀᴛᴇɢᴏʀɪᴇs',`store_page:${page}`)]);const text=trc({title:c.name,emoji:'🛒',intro:tiny('sᴛᴏʀᴇ ɪᴛᴇᴍs'),sections:[{title:'ɪᴛᴇᴍs',emoji:'🎁',items:ps.map(p=>`<b>${escapeHtml(p.name)}</b> — ${p.price} ᴘᴛs\n${escapeHtml(p.description||'')}`)}],footer:tiny('ᴛᴀᴘ ᴀɴ ɪᴛᴇᴍ ᴛᴏ ʙᴜʏ 1.')});await ctx.editMessageText(text,{parse_mode:'HTML',...Markup.inlineKeyboard(rows)}).catch(()=>{});await ctx.answerCbQuery().catch(()=>{});});
bot.action('store_cart_help',ctx=>ctx.answerCbQuery(tiny('ᴜsᴇ /ᴀᴅᴅᴄᴀʀᴛ <ᴘʀᴏᴅᴜᴄᴛ_ɪᴅ> [ǫᴛʏ], ᴛʜᴇɴ /ᴄʜᴇᴄᴋᴏᴜᴛ.'),{show_alert:true}));
bot.command('addcart',ctx=>{const p=ctx.message.text.trim().split(/\s+/).slice(1);const r=economy.addToCart(ctx.from.id,Number(p[0]),Number(p[1]||1));return ctx.reply(tiny(r.ok?'🛒 ᴀᴅᴅᴇᴅ ᴛᴏ ᴄᴀʀᴛ.':'❌ ɪᴛᴇᴍ ɴᴏᴛ ғᴏᴜɴᴅ.'));});
bot.command('cart',ctx=>{const c=economy.cart(ctx.from.id);if(!c.length)return ctx.reply(tiny('🛒 ʏᴏᴜʀ ᴄᴀʀᴛ ɪs ᴇᴍᴘᴛʏ.'));const total=c.reduce((n,x)=>n+x.price*x.quantity,0);return ctx.reply(c.map(x=>`🛍️ ${x.name} × ${x.quantity} = ${x.price*x.quantity} ᴘᴛs`).join('\n')+`\n\n💰 ᴛᴏᴛᴀʟ: ${total} ᴘᴛs\n\n/ᴄʜᴇᴄᴋᴏᴜᴛ`);});
bot.command('checkout',ctx=>{const r=economy.checkoutCart(ctx.from.id);return ctx.reply(tiny(r.ok?`🎉 ᴄᴀʀᴛ ᴄʜᴇᴄᴋᴏᴜᴛ ᴄᴏᴍᴘʟᴇᴛᴇ! -${r.total} ᴘᴛs.`:r.reason==='points'?`❌ ɴᴏᴛ ᴇɴᴏᴜɢʜ ᴘᴏɪɴᴛs. ɴᴇᴇᴅ ${r.total} ᴘᴛs.`:r.reason==='empty'?'🛒 ᴄᴀʀᴛ ɪs ᴇᴍᴘᴛʏ.':'❌ sᴏᴍᴇᴛʜɪɴɢ ɪs ᴜɴᴀᴠᴀɪʟᴀʙʟᴇ.'));});
bot.action(/^store_buy:(\d+):(\d+)\:(\d+)$/,async ctx=>{const r=economy.buy(ctx.from.id,Number(ctx.match[1]),1);if(!r.ok)return ctx.answerCbQuery(tiny(r.reason==='points'?'❌ ɴᴏᴛ ᴇɴᴏᴜɢʜ ᴘᴏɪɴᴛs.':r.reason==='stock'?'❌ sᴏʟᴅ ᴏᴜᴛ.':'❌ ɪᴛᴇᴍ ɴᴏᴛ ғᴏᴜɴᴅ.'),{show_alert:true}).catch(()=>{});await ctx.answerCbQuery(tiny(`🎉 ʙᴏᴜɢʜᴛ! -${r.total} ᴘᴛs`),{show_alert:true}).catch(()=>{});const receipt=await ctx.reply(trc({title:'sᴛᴏʀᴇ ᴘᴜʀᴄʜᴀsᴇ',emoji:'🛍️',intro:`${escapeHtml(r.product.name)} · <b>${r.total} ᴘᴛs</b>`,sections:[{title:'Balance',emoji:'💰',content:`<b>${r.user.points} ᴘᴛs</b>`}],footer:tiny('ᴛʜᴀɴᴋ ʏᴏᴜ ғᴏʀ sʜᴏᴘᴘɪɴɢ ᴡɪᴛʜ ʀᴜsʜ!')}),{parse_mode:'HTML'});const ownerId=String((process.env.ADMIN_USER_IDS||'').split(',').map(x=>x.trim()).find(Boolean)||'');const ownerKeyboard=ownerId?{reply_markup:{inline_keyboard:[[{text:'👤 ᴅᴍ ᴍʏ ᴏᴡɴᴇʀ',url:`tg://user?id=${ownerId}`,style:'primary'}]]}}:{};const delivery=economy.fulfillProduct(ctx.from.id,r.product.id,r.orderId);if(delivery){if(delivery.type==='license'){await ctx.reply(tiny(`🔑 ʏᴏᴜʀ ʟɪᴄᴇɴsᴇ ᴋᴇʏ:

${delivery.fileId}`));}else{try{const opts={caption:delivery.caption,parse_mode:'HTML'};if(delivery.type==='photo')await ctx.telegram.sendPhoto(ctx.chat.id,delivery.fileId,opts);else if(delivery.type==='video')await ctx.telegram.sendVideo(ctx.chat.id,delivery.fileId,opts);else if(delivery.type==='audio')await ctx.telegram.sendAudio(ctx.chat.id,delivery.fileId,opts);else await ctx.telegram.sendDocument(ctx.chat.id,delivery.fileId,{caption:delivery.caption,parse_mode:'HTML'});}catch(err){console.error('Store delivery failed:',err);for(const admin of String(process.env.ADMIN_USER_IDS||'').split(',').map(x=>x.trim()).filter(Boolean)){try{await ctx.telegram.sendMessage(admin,tiny(`🚨 sᴛᴏʀᴇ ᴅᴇʟɪᴠᴇʀʏ ᴀʟᴇʀᴛ\n\nᴜsᴇʀ: @${ctx.from.username||'no_username'} (${ctx.from.id})\nᴘʀᴏᴅᴜᴄᴛ: ${r.product.name}\nᴏʀᴅᴇʀ: #${r.orderId}\nʀᴇᴀsᴏɴ: ғɪʟᴇ ᴅᴇʟɪᴠᴇʀʏ ғᴀɪʟᴇᴅ`));}catch(_){}}await ctx.reply(tiny('⚠️ ᴘᴀʏᴍᴇɴᴛ ᴡᴀs sᴜᴄᴄᴇssғᴜʟ, ʙᴜᴛ ᴛʜᴇ ɢɪғᴛ ᴄᴏᴜʟᴅ ɴᴏᴛ ʙᴇ ᴅᴇʟɪᴠᴇʀᴇᴅ.\n\nᴘʟᴇᴀsᴇ ᴅᴍ ᴍʏ ᴏᴡɴᴇʀ ᴀɴᴅ ᴛʜᴇʏ ᴡɪʟʟ ʜᴇʟᴘ ʏᴏᴜ.'),ownerKeyboard);}}}else{for(const admin of String(process.env.ADMIN_USER_IDS||'').split(',').map(x=>x.trim()).filter(Boolean)){try{await ctx.telegram.sendMessage(admin,tiny(`🚨 sᴛᴏʀᴇ ᴅᴇʟɪᴠᴇʀʏ ᴀʟᴇʀᴛ\n\nᴜsᴇʀ: @${ctx.from.username||'no_username'} (${ctx.from.id})\nᴘʀᴏᴅᴜᴄᴛ: ${r.product.name}\nᴏʀᴅᴇʀ: #${r.orderId}\nʀᴇᴀsᴏɴ: ғɪʟᴇ ᴜɴᴀᴠᴀɪʟᴀʙʟᴇ`));}catch(_){}}await ctx.reply(tiny('⚠️ ʏᴏᴜʀ ᴘᴜʀᴄʜᴀsᴇ ᴡᴀs sᴜᴄᴄᴇssғᴜʟ, ʙᴜᴛ ᴛʜɪs ɪᴛᴇᴍ ᴅᴏᴇsɴ’ᴛ ʜᴀᴠᴇ ᴀ ɢɪғᴛ ғɪʟᴇ ᴀᴛᴛᴀᴄʜᴇᴅ ʏᴇᴛ.\n\nᴅᴍ ᴍʏ ᴏᴡɴᴇʀ ᴛᴏ ɢᴇᴛ ʏᴏᴜʀ ɢɪғᴛ.'),ownerKeyboard);}return receipt;});


// ============================================================
// RUSH UNIVERSE V9 — INVENTORY / CART / GIFTS / TRADING / ECONOMY
// ============================================================
function simpleNavText(title, emoji, content){return trc({title,emoji,intro:tiny(content),sections:[],footer:tiny('ᴜsᴇ ᴛʜᴇ ʙᴜᴛᴛᴏɴs ʙᴇʟᴏᴡ ᴛᴏ ᴄᴏɴᴛɪɴᴜᴇ.')});}
async function showInventory(ctx){const items=economy.inventory(ctx.from.id);const lines=items.length?items.map(x=>`<b>#${x.product_id}</b> · ${escapeHtml(x.name)} × <b>${x.quantity}</b>`):[tiny('ɪɴᴠᴇɴᴛᴏʀʏ ɪs ᴇᴍᴘᴛʏ. ʙᴜʏ sᴏᴍᴇᴛʜɪɴɢ ғʀᴏᴍ ᴛʜᴇ sᴛᴏʀᴇ.')];const kb=Markup.inlineKeyboard([[styledCallback('🛒 sᴛᴏʀᴇ','nav_store')],[styledCallback('🎁 ɢɪғᴛ ɪᴛᴇᴍ','nav_gifts')],[styledCallback('⬅️ ʜᴏᴍᴇ','nav_home')]]);return ctx.editMessageText(trc({title:'ʀᴜsʜ ɪɴᴠᴇɴᴛᴏʀʏ',emoji:'🎒',sections:[{title:'ɪᴛᴇᴍs',emoji:'📦',items:lines}]}),{parse_mode:'HTML',...kb}).catch(()=>ctx.reply(trc({title:'ʀᴜsʜ ɪɴᴠᴇɴᴛᴏʀʏ',emoji:'🎒',sections:[{title:'ɪᴛᴇᴍs',emoji:'📦',items:lines}]}),{parse_mode:'HTML',...kb}));}
bot.action('nav_inventory',showInventory); bot.command('inventory',ctx=>showInventory(ctx));
bot.action('nav_gifts',ctx=>ctx.reply(simpleNavText('ɢɪғᴛ ɪᴛᴇᴍs','🎁','ᴛʀᴀɴsғᴇʀ ᴀɴ ɪᴛᴇᴍ ғʀᴏᴍ ʏᴏᴜʀ ɪɴᴠᴇɴᴛᴏʀʏ ᴛᴏ ᴀɴᴏᴛʜᴇʀ ᴘʟᴀʏᴇʀ.'),{parse_mode:'HTML'}));
bot.command('giftitem',ctx=>{const p=ctx.message.text.trim().split(/\s+/).slice(1);if(p.length<2)return ctx.reply(tiny('ᴜsᴇ: /ɢɪғᴛɪᴛᴇᴍ <ᴜsᴇʀ_ɪᴅ> <ᴘʀᴏᴅᴜᴄᴛ_ɪᴅ> [ǫᴛʏ]'));const r=economy.giftItem(ctx.from.id,Number(p[0]),Number(p[1]),Number(p[2]||1));return ctx.reply(tiny(r.ok?'🎁 ɪᴛᴇᴍ ɢɪғᴛᴇᴅ sᴜᴄᴄᴇssғᴜʟʟʏ.':r.reason==='inventory'?'❌ ɴᴏᴛ ᴇɴᴏᴜɢʜ ɪɴ ɪɴᴠᴇɴᴛᴏʀʏ.':'❌ ᴜsᴇʀ ɴᴏᴛ ғᴏᴜɴᴅ.'));});
bot.action('nav_trading',ctx=>ctx.reply(simpleNavText('ʀᴜsʜ ᴛʀᴀᴅɪɴɢ','🔄','ᴛʀᴀᴅᴇ ᴏᴡɴᴇᴅ ɪᴛᴇᴍs ᴡɪᴛʜ ᴏᴛʜᴇʀ ᴘʟᴀʏᴇʀs.'),{parse_mode:'HTML'}));
bot.command('trade',ctx=>{const p=ctx.message.text.trim().split(/\s+/).slice(1);if(p.length<5)return ctx.reply(tiny('ᴜsᴇ: /ᴛʀᴀᴅᴇ <ᴜsᴇʀ_ɪᴅ> <ᴏғғᴇʀ_ɪᴅ> <ᴏғғᴇʀ_ǫᴛʏ> <ʀᴇǫᴜᴇsᴛ_ɪᴅ> <ʀᴇǫᴜᴇsᴛ_ǫᴛʏ>'));const r=economy.tradeOffer(ctx.from.id,Number(p[0]),Number(p[1]),Number(p[2]),Number(p[3]),Number(p[4]));return ctx.reply(tiny(r.ok?`🔄 ᴛʀᴀᴅᴇ #${r.id} sᴇɴᴛ.`:r.reason==='inventory'?'❌ ʏᴏᴜ ᴅᴏɴ\'ᴛ ᴏᴡɴ ᴇɴᴏᴜɢʜ ᴏғғᴇʀ ɪᴛᴇᴍs.':'❌ ᴛʀᴀᴅᴇ ᴄᴏᴜʟᴅ ɴᴏᴛ ʙᴇ ᴄʀᴇᴀᴛᴇᴅ.'));});
bot.command('accepttrade',ctx=>{const id=Number(ctx.message.text.trim().split(/\s+/)[1]);const r=economy.acceptTrade(ctx.from.id,id);return ctx.reply(tiny(r.ok?'✅ ᴛʀᴀᴅᴇ ᴀᴄᴄᴇᴘᴛᴇᴅ.':r.reason==='inventory'?'❌ ᴛʀᴀᴅᴇ ᴄᴀɴᴄᴇʟʟᴇᴅ: ɪᴛᴇᴍs ɴᴏ ʟᴏɴɢᴇʀ ᴀᴠᴀɪʟᴀʙʟᴇ.':'❌ ᴛʀᴀᴅᴇ ɴᴏᴛ ғᴏᴜɴᴅ.'));});
bot.action('nav_economy',ctx=>{const rows=economy.economyLeaderboard(10);const lines=rows.map((x,i)=>`${i<3?['🥇','🥈','🥉'][i]:`${i+1}.`} ${escapeHtml(x.username||`user${x.user_id}`)} · 💰 ${x.points} · 🎒 ${x.items}`);return ctx.editMessageText(trc({title:'ᴇᴄᴏɴᴏᴍʏ ʟᴇᴀᴅᴇʀʙᴏᴀʀᴅ',emoji:'📈',sections:[{title:'ᴛᴏᴘ 10',emoji:'🏆',items:lines.length?lines:[tiny('ɴᴏ ᴅᴀᴛᴀ ʏᴇᴛ.')] }]}),{parse_mode:'HTML',...Markup.inlineKeyboard([[styledCallback('⬅️ ʜᴏᴍᴇ','nav_home')]])});});
bot.command('economy',ctx=>{const rows=economy.economyLeaderboard(10);return ctx.reply(rows.map((x,i)=>`${i+1}. ${x.username||x.user_id} — ${x.points} pts · ${x.items} items`).join('\n')||tiny('ɴᴏ ᴅᴀᴛᴀ.'),{parse_mode:'HTML'});});
bot.action('nav_daily_reward',ctx=>ctx.reply(tiny('🎁 ᴜsᴇ /ᴅᴀɪʟʏʀᴇᴡᴀʀᴅ ᴛᴏ ᴄʟᴀɪᴍ 100 ᴘᴏɪɴᴛs + 25 xᴘ ᴏɴᴄᴇ ᴘᴇʀ ᴅᴀʏ.')));
bot.command('dailyreward',ctx=>{const r=economy.claimDaily(ctx.from.id);return ctx.reply(tiny(r.ok?'🎁 +100 ᴘᴛs +25 xᴘ! ᴄᴏᴍᴇ ʙᴀᴄᴋ ᴛᴏᴍᴏʀʀᴏᴡ.':'⏰ ʏᴏᴜ ᴀʟʀᴇᴀᴅʏ ᴄʟᴀɪᴍᴇᴅ ᴛᴏᴅᴀʏ.'));});
bot.action('nav_battle_pass',ctx=>ctx.reply(trc({title:'ʀᴜsʜ ʙᴀᴛᴛʟᴇ ᴘᴀss',emoji:'🎟️',sections:[{title:'ᴘʀᴏɢʀᴇssɪᴏɴ',emoji:'⭐',items:[tiny('ᴇᴀʀɴ xᴘ ʙʏ ᴘʟᴀʏɪɴɢ ɢᴀᴍᴇs, ᴡɪɴɴɪɴɢ ʙᴀᴛᴛʟᴇs ᴀɴᴅ ᴄᴏᴍᴘʟᴇᴛɪɴɢ ᴛᴀsᴋs.'),tiny('ʟᴇᴠᴇʟ ᴜᴘ ᴛᴏ ᴜɴʟᴏᴄᴋ ᴛɪᴇʀs, ᴘᴏɪɴᴛs ᴀɴᴅ ᴇxᴄʟᴜsɪᴠᴇ ɪᴛᴇᴍs.')] }]}),{parse_mode:'HTML',...Markup.inlineKeyboard([[styledCallback('💎 ᴘʀᴇᴍɪᴜᴍ ᴘᴀss','nav_premium_pass')],[styledCallback('⬅️ ʜᴏᴍᴇ','nav_home')]])}));


// ============================================================
// RUSH UNIVERSE V10 — WORLD / CLASSES / PETS / BATTLES / EVENTS
// ============================================================
function v10Menu(title,emoji,lines,buttons=[]){return trc({title,emoji,sections:[{title:'ʀᴜsʜ ᴜɴɪᴠᴇʀsᴇ',emoji:'🔥',items:lines}],footer:tiny('ᴄʜᴏᴏsᴇ ᴀɴ ᴏᴘᴛɪᴏɴ ʙᴇʟᴏᴡ.')});}
function v10Kb(rows){return Markup.inlineKeyboard([...rows,[styledCallback('⬅️ ʜᴏᴍᴇ','nav_home')]]);}
bot.action('nav_world',ctx=>{const zs=rushV10.zones(ctx.from.id);const lines=zs.map(z=>`${z.unlocked?'🔓':'🔒'} <b>${z.id}. ${z.name}</b> · ${z.reward} ᴘᴛs · ${z.unlock_points} ᴘᴛs`);return ctx.editMessageText(v10Menu('ʀᴜsʜ ᴡᴏʀʟᴅ','🗺️',lines),{parse_mode:'HTML',...v10Kb(zs.filter(z=>z.unlocked).map(z=>[styledCallback(`🚀 ${z.name}`,`world:${z.id}`)]))})});
bot.action(/^world:(\d+)$/,ctx=>{const r=rushV10.travel(ctx.from.id,Number(ctx.match[1]));return ctx.answerCbQuery(r.ok?`🚀 ${r.zone.name}`:tiny(`🔒 ᴜɴʟᴏᴄᴋ ʀᴇǫᴜɪʀᴇs ${r.needed||0} ᴘᴛs.`),{show_alert:!r.ok}).catch(()=>{})});
bot.action('nav_classes',ctx=>{const cs=['ᴡᴀʀʀɪᴏʀ','ᴀssᴀssɪɴ','sɴɪᴘᴇʀ','ᴍᴀɢᴇ','ᴛᴀɴᴋ'];return ctx.editMessageText(v10Menu('ʙᴀᴛᴛʟᴇ ᴄʟᴀssᴇs','⚔️',cs.map(x=>`⚔️ <b>${x}</b>`)),{parse_mode:'HTML',...v10Kb(cs.map(x=>[styledCallback(`⚔️ ${x}`,`class:${x}`)]))})});
bot.action(/^class:(.+)$/,ctx=>{const r=rushV10.setClass(ctx.from.id,ctx.match[1]);return ctx.answerCbQuery(r.ok?`⚔️ ${r.class}`:tiny('❌ ɪɴᴠᴀʟɪᴅ ᴄʟᴀss.'),{show_alert:!r.ok}).catch(()=>{})});
bot.action('nav_pets',ctx=>{const p=rushV10.pets(ctx.from.id);return ctx.editMessageText(v10Menu('ᴘᴇᴛs & ᴄᴏʟʟᴇᴄᴛɪᴏɴs','🐾',p.length?p.map(x=>`🐾 <b>${escapeHtml(x.name)}</b> · ${x.rarity} · ʟᴠʟ ${x.level}`):[tiny('ɴᴏ ᴘᴇᴛs ʏᴇᴛ. ᴀᴅᴍɪɴs ᴄᴀɴ ɢɪᴠᴇ ᴘᴇᴛs ᴜsɪɴɢ ᴛʜᴇ ᴄᴏᴍᴍᴀɴᴅ.')]),{parse_mode:'HTML',...v10Kb([])})});
bot.action('nav_minigames',ctx=>ctx.editMessageText(v10Menu('ᴍɪɴɪ ɢᴀᴍᴇs','🎮',[tiny('🎡 ᴡʜᴇᴇʟ — ʀᴀɴᴅᴏᴍ ᴠɪʀᴛᴜᴀʟ ᴘᴏɪɴᴛ ʀᴇᴡᴀʀᴅs.'),tiny('🎲 ᴅɪᴄᴇ — ʙᴇᴀᴛ ᴛʜᴇ ʙᴏᴛ.'),tiny('🎰 sʟᴏᴛs — ʜɪᴛ ᴛʜʀᴇᴇ ᴛᴏ ᴡɪɴ ʙɪɢ.'),tiny('💣 ᴍɪɴᴇs — ᴄʜᴀɴᴄᴇ ʙᴀsᴇᴅ ᴠɪʀᴛᴜᴀʟ ʀᴇᴡᴀʀᴅs.')]),{parse_mode:'HTML',...v10Kb([[styledCallback('🎡 ᴡʜᴇᴇʟ','mini:ᴡʜᴇᴇʟ')],[styledCallback('🎲 ᴅɪᴄᴇ','mini:ᴅɪᴄᴇ')],[styledCallback('🎰 sʟᴏᴛs','mini:sʟᴏᴛs')],[styledCallback('💣 ᴍɪɴᴇs','mini:ᴍɪɴᴇs')]])}));
bot.action(/^mini:(.+)$/,ctx=>{const r=rushV10.game(ctx.from.id,ctx.match[1]);return ctx.answerCbQuery(r.ok?(r.reward?`🎉 +${r.reward} ᴘᴛs`:'😵 ɴᴏ ʀᴇᴡᴀʀᴅ'):tiny('❌ ɢᴀᴍᴇ ᴇʀʀᴏʀ.'),{show_alert:true}).catch(()=>{})});
bot.action('nav_event',ctx=>{const p=rushV10.profile(ctx.from.id);return ctx.editMessageText(v10Menu('ʟɪᴠᴇ ᴇᴠᴇɴᴛ','🎉',[tiny('⚡ ᴅᴀɪʟʏ ʀᴜsʜ ᴇᴠᴇɴᴛ'),tiny('🎁 ᴄʟᴀɪᴍ 250 ᴠɪʀᴛᴜᴀʟ ᴘᴏɪɴᴛs ᴏɴᴄᴇ ᴘᴇʀ ᴅᴀʏ.'),`🗺️ ${p.zone?`ᴢᴏɴᴇ ${p.zone}`:'ᴢᴏɴᴇ 1'}`],[styledCallback('🎁 ᴄʟᴀɪᴍ ᴇᴠᴇɴᴛ','event_claim')]));});
bot.action('event_claim',ctx=>{const r=rushV10.dailyEvent(ctx.from.id);return ctx.answerCbQuery(r.ok?'🎉 +250 ᴘᴛs!':tiny('⏰ ᴀʟʀᴇᴀᴅʏ ᴄʟᴀɪᴍᴇᴅ.'),{show_alert:true}).catch(()=>{})});
bot.command('battle',ctx=>{const r=rushV10.battle(ctx.from.id);return ctx.reply(tiny(r.win?`⚔️ ᴠɪᴄᴛᴏʀʏ! +${r.reward} ᴘᴛs.`:`💥 ʏᴏᴜ ʟᴏsᴛ ᴛʜᴇ ᴅᴜᴇʟ. ᴄʟᴀss: ${r.class}.`))});
bot.command('rushworld',ctx=>ctx.reply(tiny('🗺️ ᴏᴘᴇɴ ʀᴜsʜ ᴡᴏʀʟᴅ ғʀᴏᴍ ᴛʜᴇ ᴍᴀɪɴ ᴍᴇɴᴜ.')));
bot.command('minigames',ctx=>ctx.reply(tiny('🎮 ᴏᴘᴇɴ ᴍɪɴɪ ɢᴀᴍᴇs ғʀᴏᴍ ᴛʜᴇ ᴍᴀɪɴ ᴍᴇɴᴜ.')));

// ============================================================
// /me — quick personal stats without going through menus
// ============================================================
bot.command('me', async (ctx) => {
  const user = db.getUser(ctx.from.id) || { points: 0 };
  const done = db.listGameCompletions(ctx.from.id);
  const rank = db.getUserRank(ctx.from.id);
  const referrals = db.countReferrals(ctx.from.id);
  const dropsWon = db.countClaimsByUser(ctx.from.id);
    await ctx.reply(trc({
    title: 'Your Stats',
    emoji: '👤',
    sections: [{ title: 'Overview', emoji: '📊', table: { headers: ['STAT', 'VALUE'], rows: [['Points', user.points], ['Rank', `#${rank}`], ['Games', `${done.length}/${Object.keys(GAME_LABELS).length}`], ['Drops won', dropsWon], ['Referrals', referrals]] } }],
    footer: 'Keep playing and completing tasks to climb the board.',
  }), { parse_mode: 'HTML' });
});

bot.command('leaderboard', (ctx) => sendLeaderboard(ctx, false));

// ============================================================
// LEADERBOARD
// ============================================================
async function sendLeaderboard(ctx, isEdit) {
  const top = db.topUsers(10);
  const lines = [trc({ title: 'Leaderboard — Top 10', emoji: '📊', intro: 'See who is leading the rush.', sections: [] }), ''];
  top.forEach((u, i) => {
    const medal = ['🥇', '🥈', '🥉'][i] || `${i + 1}.`;
    lines.push(`${medal} ${escapeHtml(u.username || `user${u.user_id}`)} — ${u.points} pts`);
  });
  if (top.length === 0) lines.push('No one has scored yet — be the first!');
  const kb = Markup.inlineKeyboard([[styledCallback('🔥 7-Day', 'leaderboard_weekly')],[styledCallback('⬅ Back', 'nav_home')]]);
  const opts = { parse_mode: 'HTML', ...kb };
  if (isEdit) return ctx.editMessageText(lines.join('\n'), opts).catch(() => ctx.reply(lines.join('\n'), opts));
  return ctx.reply(lines.join('\n'), opts);
}
bot.action('nav_leaderboard', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  return sendLeaderboard(ctx, true);
});

// ============================================================
// RUSH LEAGUE / TOURNAMENT / DAILY RUSH
// ============================================================
function leagueText(userId) {
  const user = db.getUser(userId) || { points: 0 };
  const league = db.leagueForPoints(user.points);
  const top = db.leagueLeaderboard(10);
  const lines = top.map((u) => `${u.rank <= 3 ? ['🥇','🥈','🥉'][u.rank-1] : `${u.rank}.`} ${escapeHtml(u.username || `user${u.user_id}`)} — ${u.points} pts · ${u.league.emoji} ${u.league.name}`);
  return trc({ title: 'ʀᴜsʜ ʟᴇᴀɢᴜᴇ', emoji: '👑', intro: `You are currently in ${league.emoji} <b>${league.name}</b>.`, sections: [
    { title: 'Your League', emoji: '🏆', content: `<b>${league.emoji} ${league.name}</b>\n💰 ${user.points} points` },
    { title: 'Ranks', emoji: '📈', items: ['🥉 ʙʀᴏɴᴢᴇ — 0+', '🥈 sɪʟᴠᴇʀ — 250+', '🥇 ɢᴏʟᴅ — 750+', '💎 ᴘʟᴀᴛɪɴᴜᴍ — 1,500+', '👑 ᴅɪᴀᴍᴏɴᴅ — 2,500+', '🔥 ʀᴜsʜ ʟᴇɢᴇɴᴅ — 5,000+'] },
    { title: 'Top Players', emoji: '🔥', items: lines.length ? lines : [tiny('ɴᴏ ᴘʟᴀʏᴇʀs ʏᴇᴛ.')] }
  ], footer: tiny('Win games and earn points to climb the league.') });
}
bot.action('nav_league', async (ctx) => {
  await ctx.editMessageText(leagueText(ctx.from.id), { parse_mode: 'HTML', ...Markup.inlineKeyboard([[styledCallback('📊 ʟᴇᴀᴅᴇʀʙᴏᴀʀᴅ', 'nav_leaderboard')],[styledCallback('⬅️ ʙᴀᴄᴋ', 'nav_home')]]) }).catch(() => {});
  await ctx.answerCbQuery().catch(() => {});
});

function tournamentText(userId) {
  const t = db.tournamentStatus();
  const joined = t.players.some(p => p.user_id === userId);
  const lines = t.players.slice(0, 10).map((p, i) => `${i < 3 ? ['🥇','🥈','🥉'][i] : `${i+1}.`} ${escapeHtml(p.username || String(p.user_id))} — ${p.points} pts`);
  return trc({ title: 'ᴡᴇᴇᴋʟʏ ᴛᴏᴜʀɴᴀᴍᴇɴᴛ', emoji: '🏟️', intro: `Week of <b>${t.week}</b> · ${t.players.length}/${t.maxPlayers} players registered.`, sections: [
    { title: 'Format', emoji: '⚔️', items: ['32-player open tournament', 'Your game wins add to your tournament standing', 'Top players are displayed publicly', 'New registration opens each Monday'] },
    { title: 'Standings', emoji: '🏆', items: lines.length ? lines : [tiny('ɴᴏ ʀᴇɢɪsᴛʀᴀᴛɪᴏɴs ʏᴇᴛ.')] }
  ], footer: joined ? tiny('✅ ʏᴏᴜ ᴀʀᴇ ʀᴇɢɪsᴛᴇʀᴇᴅ.') : tiny('Register now and play games to climb the weekly standings.') });
}
bot.action('nav_tournament', async (ctx) => {
  const t = db.tournamentStatus(); const joined = t.players.some(p => p.user_id === ctx.from.id);
  const buttons = [];
  if (!joined) buttons.push([styledCallback('🏟️ ᴊᴏɪɴ ᴛᴏᴜʀɴᴀᴍᴇɴᴛ', 'tournament_join')]);
  buttons.push([styledCallback('🎮 ᴘʟᴀʏ ɢᴀᴍᴇs', 'nav_games')],[styledCallback('⬅️ ʙᴀᴄᴋ', 'nav_home')]);
  await ctx.editMessageText(tournamentText(ctx.from.id), { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) }).catch(() => {});
  await ctx.answerCbQuery().catch(() => {});
});
bot.action('tournament_join', async (ctx) => {
  const result = db.joinTournament(ctx.from.id, ctx.from.username || ctx.from.first_name);
  if (!result.ok) return ctx.answerCbQuery(tiny('ᴛʜᴇ ᴛᴏᴜʀɴᴀᴍᴇɴᴛ ɪs ғᴜʟʟ.'), { show_alert: true }).catch(() => {});
  await ctx.answerCbQuery(result.joined ? tiny('🏟️ ʀᴇɢɪsᴛᴇʀᴇᴅ!') : tiny('ʏᴏᴜ ᴀʀᴇ ᴀʟʀᴇᴀᴅʏ ʀᴇɢɪsᴛᴇʀᴇᴅ.'), { show_alert: true }).catch(() => {});
  return ctx.editMessageText(tournamentText(ctx.from.id), { parse_mode: 'HTML', ...Markup.inlineKeyboard([[styledCallback('🎮 ᴘʟᴀʏ ɢᴀᴍᴇs', 'nav_games')],[styledCallback('⬅️ ʙᴀᴄᴋ', 'nav_home')]]) }).catch(() => {});
});

function dailyRushText(userId) {
  const stats = db.ensureDailyChallenge(userId);
  const user = db.getUser(userId) || { points: 0 };
  const today = new Date().toISOString().slice(0,10);
  return trc({ title: 'ᴅᴀɪʟʏ ʀᴜsʜ', emoji: '🔥', intro: tiny('A fresh challenge resets every day.'), sections: [
    { title: 'Today', emoji: '🎯', content: `<b>Win ${stats.challenge_target} games</b>\n<code>${progressBar(stats.challenge_progress, stats.challenge_target)}</code>\n${stats.challenge_progress}/${stats.challenge_target} wins\n\n🎁 Reward: <b>+${stats.challenge_reward} points</b>` },
    { title: 'Your Streak', emoji: '🔥', content: `<b>${stats.streak} days</b> current · <b>${stats.best_streak}</b> best\n💰 ${user.points} points` },
    { title: 'Reset', emoji: '⏰', content: `UTC day: <code>${today}</code>` }
  ], footer: stats.challenge_progress >= stats.challenge_target ? tiny('🏆 ᴛᴏᴅᴀʏ’s ʀᴜsʜ ᴄʜᴀʟʟᴇɴɢᴇ ᴄᴏᴍᴘʟᴇᴛᴇ!') : tiny('Keep playing — every win moves the challenge forward.') });
}
bot.action('nav_daily_rush', async (ctx) => {
  await ctx.editMessageText(dailyRushText(ctx.from.id), { parse_mode: 'HTML', ...Markup.inlineKeyboard([[styledCallback('🎮 ᴘʟᴀʏ ɴᴏᴡ', 'nav_games')],[styledCallback('👑 ʀᴜsʜ ʟᴇᴀɢᴜᴇ', 'nav_league')],[styledCallback('⬅️ ʙᴀᴄᴋ', 'nav_home')]]) }).catch(() => {});
  await ctx.answerCbQuery().catch(() => {});
});

// ============================================================
// RUSH UNIVERSE V6 — PROFILES / CLANS / RANKED / PREMIUM / FEED
// ============================================================
function fullProfileText(userId) {
  const p = social.profile(userId);
  const tier = social.rankedTier(p.ranked.rating);
  const clan = p.clan ? `🛡️ <b>${escapeHtml(p.clan.name)}</b> · Lv.${p.clan.level}` : tiny('ɴᴏ ᴄʟᴀɴ');
  return trc({ title: 'ᴘʟᴀʏᴇʀ ᴘʀᴏғɪʟᴇ', emoji: '👤', intro: `<b>${escapeHtml(p.u.username ? '@'+p.u.username : p.u.user_id)}</b> ${p.premium ? '💎' : ''}`, sections: [
    { title: 'Progression', emoji: '⭐', content: `<b>Lv.${p.s.level}</b> · ${p.s.xp} XP\n💰 ${p.u.points} points · 🔥 ${p.s.streak} day streak` },
    { title: 'Ranked', emoji: '⚔️', content: `${tier.emoji} <b>${tier.name}</b> · <b>${p.ranked.rating}</b> rating\n🏆 ${p.ranked.wins} wins · 💀 ${p.ranked.losses} losses` },
    { title: 'Clan', emoji: '🛡️', content: clan },
    { title: 'Achievements', emoji: '🏅', content: `<b>${p.achievements.length}</b> unlocked` },
    { title: 'Season', emoji: '🌟', content: `<b>${escapeHtml(p.season.name)}</b>` }
  ], footer: p.premium ? tiny('💎 ᴘʀᴇᴍɪᴜᴍ ᴘᴀss ᴀᴄᴛɪᴠᴇ.') : tiny('ᴡɪɴ ɢᴀᴍᴇs, ʀᴀɴᴋ ᴜᴘ ᴀɴᴅ ᴜɴʟᴏᴄᴋ ʙᴀᴅɢᴇs.') });
}
bot.action('nav_full_profile', async ctx => {
  await ctx.editMessageText(fullProfileText(ctx.from.id), { parse_mode:'HTML', ...Markup.inlineKeyboard([[styledCallback('⚔️ Ranked','nav_ranked')],[styledCallback('🛡️ Clans','nav_clans')],[styledCallback('🏅 Achievements','nav_achievements')],[styledCallback('⬅️ ʙᴀᴄᴋ','nav_home')]]) }).catch(()=>{});
  await ctx.answerCbQuery().catch(()=>{});
});

function rankedText() {
  const rows = social.rankedLeaderboard(10);
  const lines = rows.length ? rows.map((r,i)=>`${['🥇','🥈','🥉'][i]||`${i+1}.`} <b>${escapeHtml(r.username||String(r.user_id))}</b> — ${r.rating} · ${social.rankedTier(r.rating).emoji} ${social.rankedTier(r.rating).name}`) : [tiny('ɴᴏ ʀᴀɴᴋᴇᴅ ᴘʟᴀʏᴇʀs ʏᴇᴛ.')];
  const me=social.getRanked(thisUserIdForRender);
  return trc({title:'ʀᴜsʜ ʀᴀɴᴋᴇᴅ',emoji:'⚔️',intro:'ʀᴀɴᴋᴇᴅ ᴘᴠᴘ ᴜsᴇs ᴇʟᴏ ʀᴀᴛɪɴɢ.',sections:[{title:'Your Rating',emoji:'🎯',content:`<b>${me.rating}</b> · ${social.rankedTier(me.rating).emoji} ${social.rankedTier(me.rating).name}\n🏆 ${me.wins} wins · 💀 ${me.losses} losses`},{title:'Top 10',emoji:'🏆',items:lines}],footer:tiny('ᴜsᴇ /ᴡᴀʀ @ᴜsᴇʀɴᴀᴍᴇ ᴛᴏ sᴛᴀʀᴛ ᴀ ʀᴀɴᴋᴇᴅ ᴡᴀʀ.')});
}
let thisUserIdForRender = 0;
bot.action('nav_ranked', async ctx => {
  thisUserIdForRender=ctx.from.id;
  await ctx.editMessageText(rankedText(),{parse_mode:'HTML',...Markup.inlineKeyboard([[styledCallback('⚔️ ᴄʜᴀʟʟᴇɴɢᴇ ᴀ ᴘʟᴀʏᴇʀ','nav_war')],[styledCallback('👤 ᴘʀᴏғɪʟᴇ','nav_full_profile')],[styledCallback('⬅️ ʙᴀᴄᴋ','nav_home')]])}).catch(()=>{});
  await ctx.answerCbQuery().catch(()=>{});
});

function clansText(userId) {
  const mine=social.clanForUser(userId), rows=social.clanLeaderboard(8);
  const list=rows.map((c,i)=>`${['🥇','🥈','🥉'][i]||`${i+1}.`} <b>${escapeHtml(c.name)}</b> · Lv.${c.level} · ${c.members} 👥 · ${c.xp} XP`);
  return trc({title:'ʀᴜsʜ ᴄʟᴀɴs',emoji:'🛡️',intro:mine?`ʏᴏᴜʀ ᴄʟᴀɴ: <b>${escapeHtml(mine.name)}</b>`:tiny('ᴄʀᴇᴀᴛᴇ ᴏʀ ᴊᴏɪɴ ᴀ ᴄʟᴀɴ ᴛᴏ ᴄᴏᴍᴘᴇᴛᴇ.'),sections:[{title:'Clan System',emoji:'⚔️',items:[tiny('ᴜᴘ ᴛᴏ 50 ᴍᴇᴍʙᴇʀs'),tiny('ᴇᴀʀɴ ᴄʟᴀɴ xᴘ ғʀᴏᴍ ɢᴀᴍᴇ ᴡɪɴs'),tiny('ᴄʟᴀɴ ᴡɪɴs ᴄᴏᴜɴᴛ ᴛᴏᴡᴀʀᴅ ᴛʜᴇ ᴄʟᴀɴ ʟᴇᴀᴅᴇʀʙᴏᴀʀᴅ')]},{title:'Top Clans',emoji:'🏆',items:list.length?list:[tiny('ɴᴏ ᴄʟᴀɴs ʏᴇᴛ.')] }],footer:mine?tiny('ᴜsᴇ ᴄʟᴀɴ ᴄᴏᴍᴍᴀɴᴅs ᴛᴏ ᴍᴀɴᴀɢᴇ ʏᴏᴜʀ ᴄʟᴀɴ.'):tiny('ᴜsᴇ /ᴄʟᴀɴ ɴᴀᴍᴇ ᴛᴏ ᴄʀᴇᴀᴛᴇ ᴏɴᴇ.')});
}
bot.action('nav_clans', async ctx => {
  const mine=social.clanForUser(ctx.from.id);
  const rows=[[styledCallback('🏆 ʀᴇғʀᴇsʜ','nav_clans')]];
  if(!mine) rows.push([styledCallback('🛡️ ᴄʀᴇᴀᴛᴇ ᴄʟᴀɴ','clan_create_help')]); else rows.push([styledCallback('🚪 ʟᴇᴀᴠᴇ ᴄʟᴀɴ','clan_leave')]);
  rows.push([styledCallback('⬅️ ʙᴀᴄᴋ','nav_home')]);
  await ctx.editMessageText(clansText(ctx.from.id),{parse_mode:'HTML',...Markup.inlineKeyboard(rows)}).catch(()=>{}); await ctx.answerCbQuery().catch(()=>{});
});
bot.action('clan_create_help', async ctx=>{await ctx.answerCbQuery(tiny('ᴜsᴇ /ᴄʟᴀɴ <ɴᴀᴍᴇ> ᴛᴏ ᴄʀᴇᴀᴛᴇ ᴀ ᴄʟᴀɴ.'),{show_alert:true}).catch(()=>{});});
bot.command('clan', async ctx=>{const name=ctx.message.text.split(/\s+/).slice(1).join(' ');if(!name)return ctx.reply(clansText(ctx.from.id),{parse_mode:'HTML',...Markup.inlineKeyboard([[styledCallback('⬅️ ʙᴀᴄᴋ','nav_home')]])});const r=social.createClan(ctx.from.id,name);const msg=r.ok?`🛡️ <b>ᴄʟᴀɴ ᴄʀᴇᴀᴛᴇᴅ!</b>\n\n<b>${escapeHtml(r.clan.name)}</b> · Lv.1`:r.reason==='already'?tiny('ʏᴏᴜ ᴀʀᴇ ᴀʟʀᴇᴀᴅʏ ɪɴ ᴀ ᴄʟᴀɴ.'):r.reason==='taken'?tiny('ᴛʜᴀᴛ ᴄʟᴀɴ ɴᴀᴍᴇ ɪs ᴛᴀᴋᴇɴ.'):tiny('ᴄʟᴀɴ ɴᴀᴍᴇ ᴍᴜsᴛ ʙᴇ 3-24 ᴄʜᴀʀᴀᴄᴛᴇʀs.');return ctx.reply(msg,{parse_mode:'HTML'});});
bot.action('clan_leave',async ctx=>{const ok=social.leaveClan(ctx.from.id);await ctx.answerCbQuery(ok?tiny('🚪 ʟᴇғᴛ ᴄʟᴀɴ.'):tiny('ʏᴏᴜ ᴀʀᴇ ɴᴏᴛ ɪɴ ᴀ ᴄʟᴀɴ.'),{show_alert:true}).catch(()=>{});return ctx.editMessageText(clansText(ctx.from.id),{parse_mode:'HTML',...Markup.inlineKeyboard([[styledCallback('⬅️ ʙᴀᴄᴋ','nav_home')]])}).catch(()=>{});});

bot.action('nav_premium_pass', async ctx=>{const p=social.premiumPass(ctx.from.id);const next=Math.max(0,p.tier-p.claimed);const text=trc({title:'ᴘʀᴇᴍɪᴜᴍ ᴘᴀss',emoji:'💎',intro:p.premium?tiny('ᴘʀᴇᴍɪᴜᴍ ɪs ᴀᴄᴛɪᴠᴇ ᴏɴ ʏᴏᴜʀ ᴀᴄᴄᴏᴜɴᴛ.'):tiny('ᴘʀᴇᴍɪᴜᴍ ᴘᴀss ʀᴇǫᴜɪʀᴇs ᴘʀᴇᴍɪᴜᴍ ᴀᴄᴄᴇss.'),sections:[{title:p.season.name,emoji:'🌟',content:`ᴛɪᴇʀ <b>${p.tier}/30</b>\nᴄʟᴀɪᴍᴇᴅ: <b>${p.claimed}</b>\n🎁 ᴜɴᴄʟᴀɪᴍᴇᴅ: <b>${next}</b>`},{title:'Rewards',emoji:'🎁',items:[tiny('ᴇᴠᴇʀʏ ᴛɪᴇʀ ɢɪᴠᴇs ᴘᴏɪɴᴛs'),tiny('ᴘʀᴇᴍɪᴜᴍ ᴘʟᴀʏᴇʀs ɢᴇᴛ ᴇxᴄʟᴜsɪᴠᴇ ʀᴇᴡᴀʀᴅs'),tiny('ᴛɪᴇʀs ᴀʀᴇ ᴘᴏᴡᴇʀᴇᴅ ʙʏ xᴘ')]}],footer:tiny('ᴘʟᴀʏ ɢᴀᴍᴇs ᴛᴏ ᴇᴀʀɴ xᴘ.')});const rows=[];if(p.premium&&next)rows.push([styledCallback('🎁 ᴄʟᴀɪᴍ ᴛɪᴇʀ','premium_claim')]);rows.push([styledCallback('⬅️ ʙᴀᴄᴋ','nav_home')]);await ctx.editMessageText(text,{parse_mode:'HTML',...Markup.inlineKeyboard(rows)}).catch(()=>{});await ctx.answerCbQuery().catch(()=>{});});
bot.action('premium_claim',async ctx=>{const r=social.claimPremiumTier(ctx.from.id);if(!r.ok)return ctx.answerCbQuery(r.reason==='premium'?tiny('💎 ᴘʀᴇᴍɪᴜᴍ ɪs ʀᴇǫᴜɪʀᴇᴅ.'):tiny('ɴᴏ ᴜɴᴄʟᴀɪᴍᴇᴅ ᴛɪᴇʀs ʏᴇᴛ.'),{show_alert:true}).catch(()=>{});await ctx.answerCbQuery(tiny(`🎉 ᴛɪᴇʀ ${r.tier} ᴄʟᴀɪᴍᴇᴅ! +${r.reward} ᴘᴏɪɴᴛs`),{show_alert:true}).catch(()=>{});return ctx.editMessageText(fullProfileText(ctx.from.id),{parse_mode:'HTML',...Markup.inlineKeyboard([[styledCallback('💎 ᴘʀᴇᴍɪᴜᴍ ᴘᴀss','nav_premium_pass')],[styledCallback('⬅️ ʙᴀᴄᴋ','nav_home')]])}).catch(()=>{});});

bot.action('nav_feed',async ctx=>{const rows=social.latestFeed(10);const items=rows.length?rows.map(r=>`${r.event} <b>${escapeHtml(r.username||String(r.user_id))}</b>${r.detail?` — ${escapeHtml(r.detail)}`:''}`):[tiny('ɴᴏ ʟɪᴠᴇ ᴇᴠᴇɴᴛs ʏᴇᴛ.')];const text=trc({title:'ʟɪᴠᴇ ʀᴜsʜ ғᴇᴇᴅ',emoji:'🌎',intro:tiny('ʟɪᴠᴇ ᴡɪɴs, ʀᴀɴᴋ ᴜᴘs ᴀɴᴅ ᴄʟᴀɴ ᴍᴏᴍᴇɴᴛs.'),sections:[{title:'Latest',emoji:'🔥',items}],footer:tiny('ᴛʜᴇ ғᴇᴇᴅ ᴜᴘᴅᴀᴛᴇs ᴡʜᴇɴ ᴘʟᴀʏᴇʀs ᴍᴀᴋᴇ ʙɪɢ ᴍᴏᴠᴇs.')});await ctx.editMessageText(text,{parse_mode:'HTML',...Markup.inlineKeyboard([[styledCallback('🔄 ʀᴇғʀᴇsʜ','nav_feed')],[styledCallback('⬅️ ʙᴀᴄᴋ','nav_home')]])}).catch(()=>{});await ctx.answerCbQuery().catch(()=>{});});

// ============================================================
// REFERRAL LINK
// ============================================================

bot.action('leaderboard_weekly', async (ctx) => {
  const rows = db.weeklyLeaderboard(10);
  const lines = rows.length ? rows.map((u, i) => `${['🥇','🥈','🥉'][i] || `${i+1}.`} <b>${escapeHtml(u.username || String(u.user_id))}</b> — ${u.weekly_points} pts`) : ['No points earned in the last 7 days yet.'];
  const text = trc({ title: '7-Day Leaderboard', emoji: '🔥', intro: 'Who earned the most points during the last seven days?', sections: [{ title: 'Top Players', emoji: '🏆', items: lines }], footer: 'The leaderboard updates automatically as rewards are earned.' });
  await ctx.editMessageText(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[styledCallback('📊 All-Time', 'nav_leaderboard')],[styledCallback('⬅ Back', 'nav_home')]]) }).catch(() => {});
  await ctx.answerCbQuery().catch(() => {});
});

bot.action('nav_referral', async (ctx) => {
  const me = await bot.telegram.getMe();
  const link = `https://t.me/${me.username}?start=${ctx.from.id}`;
  const count = db.countReferrals(ctx.from.id);
  const text = trc({
    title: 'Your Referral Link',
    emoji: '🔗',
    sections: [
      { title: 'Your Link', emoji: '🌐', content: code(link) },
      { title: 'Referral Stats', emoji: '📈', content: `You've referred <b>${count}</b> people so far. Each successful referral earns you <b>1 point</b>.` },
    ],
    footer: 'Share your link and bring more people into the rush.',
  });
  await ctx.editMessageText(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[styledCallback('⬅ Back', 'nav_home')]]) }).catch(() => {});
  await ctx.answerCbQuery().catch(() => {});
});



bot.action('nav_jackpot', async (ctx) => {
  const jackpot = db.jackpotStatus();
  if (!jackpot) {
    const text = trc({ title: 'Jackpot', emoji: '🎰', intro: 'The next Rush Jackpot is being prepared.', sections: [{ title: 'How it works', emoji: '🎟️', items: ['Win games to earn tickets', 'More tickets = higher chance', 'One winner receives the jackpot'] }], footer: 'Check back shortly.' });
    await ctx.editMessageText(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[styledCallback('⬅ Back', 'nav_home')]]) }).catch(() => {});
    return ctx.answerCbQuery().catch(() => {});
  }
  const my = db.getStats(ctx.from.id);
  const myTickets = db.db.prepare('SELECT tickets FROM jackpot_tickets WHERE event_id = ? AND user_id = ?').get(jackpot.id, ctx.from.id)?.tickets || 0;
  const text = trc({ title: jackpot.title, emoji: '🎰', intro: 'Every game win adds a free ticket to the live draw.', sections: [{ title: 'Jackpot', emoji: '💰', content: `<b>${jackpot.prize_points} points</b>\n🎟️ ${jackpot.totalTickets} tickets · 👥 ${jackpot.players} players` }, { title: 'Your Tickets', emoji: '🎟️', content: `<b>${myTickets}</b> tickets · Level <b>${my.level}</b>` }], footer: `Draw ends: ${new Date(jackpot.ends_at).toLocaleString()}` });
  await ctx.editMessageText(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[styledCallback('🎮 Play for a Ticket', 'nav_games')],[styledCallback('⬅ Back', 'nav_home')]]) }).catch(() => {});
  await ctx.answerCbQuery().catch(() => {});
});

// ============================================================
// GAMIFICATION ENGINE
// ============================================================
function progressBar(value, max, size = 10) {
  const ratio = max ? Math.min(1, Math.max(0, value / max)) : 0;
  const filled = Math.round(ratio * size);
  return '█'.repeat(filled) + '░'.repeat(size - filled);
}

async function processGameWin(ctx, gameType) {
  const first = db.awardPointTxn(ctx.from.id, ctx.from.username, gameType);
  db.joinTournament(ctx.from.id, ctx.from.username || ctx.from.first_name);
  const taskRewards = await completeGameTasks(ctx, gameType);
  const extra = db.recordGameWin(ctx.from.id, gameType);
  social.addClanXp(ctx.from.id, 25);
  social.addFeed(ctx.from.id, ctx.from.username || ctx.from.first_name || `user${ctx.from.id}`, '🏆', `${gameType.replace(/_/g, ' ')} win`);
  const channelClaim = await postGameWinToChannel(
    ctx.from.id,
    ctx.from.username || ctx.from.first_name || `user${ctx.from.id}`,
    gameType
  );
  return { first, taskRewards, extra, channelClaim };
}

function gamificationRewardLine(result) {
  const lines = [];
  const taskPoints = (result.taskRewards || []).reduce((sum, r) => sum + r.points, 0);
  if (result.first?.newlyAwarded) lines.push('🏆 <b>+1 game point</b>');
  if (taskPoints) lines.push(`🎁 <b>+${taskPoints} task points</b>`);
  if (result.extra?.xpGain) lines.push(`✨ <b>+${result.extra.xpGain} XP</b>`);
  if (result.extra?.stats?.combo >= 3) lines.push(`⚡ <b>${result.extra.stats.combo}× combo</b>`);
  if (result.extra?.challenge?.justCompleted) lines.push(`🎯 <b>Daily challenge complete: +${result.extra.challenge.reward} points!</b>`);
  if (result.extra?.achievementsUnlocked?.length) lines.push(`🏅 <b>Achievement unlocked!</b>`);
  return lines.length ? `\n\n${lines.join('\n')}` : '';
}

function profileText(userId) {
  const summary = db.statsSummary(userId);
  const { user, stats, achievements } = summary;
  const currentFloor = stats.level <= 1 ? 0 : Math.pow(stats.level - 1, 2) * 50;
  const intoLevel = Math.max(0, stats.xp - currentFloor);
  const needed = Math.max(1, summary.nextLevelXp - currentFloor);
  return trc({
    title: 'Your Progress', emoji: '👤',
    intro: 'Your Rush profile, streak and progression at a glance.',
    sections: [
      { title: 'Level', emoji: '⭐', content: `<b>Level ${stats.level}</b> · ${stats.xp} XP\n<code>${progressBar(intoLevel, needed)}</code>\n${intoLevel}/${needed} XP to next level` },
      { title: 'Streak', emoji: '🔥', content: `<b>${stats.streak} days</b> current · <b>${stats.best_streak}</b> best\n${stats.streak >= 7 ? '🔥 You are on fire!' : 'Keep coming back every day.'}` },
      { title: 'Today', emoji: '🎮', content: `<b>${stats.daily_game_wins}</b> game wins · <b>${stats.combo}×</b> combo` },
      { title: 'Badges', emoji: '🏅', content: achievements.length ? achievements.slice(0, 8).map(a => db.ACHIEVEMENTS[a.achievement_key]?.[0] || a.achievement_key).join(' · ') : 'No badges yet — win a game to get your first one.' },
    ],
    footer: `💰 ${user.points} points · Keep playing to level up.`
  });
}

bot.action('nav_profile', async (ctx) => {
  db.touchActivity(ctx.from.id);
  await ctx.editMessageText(profileText(ctx.from.id), { parse_mode: 'HTML', ...Markup.inlineKeyboard([[styledCallback('⬅ Back', 'nav_home')]]) }).catch(() => {});
  await ctx.answerCbQuery().catch(() => {});
});

bot.action('nav_challenge', async (ctx) => {
  const stats = db.ensureDailyChallenge(ctx.from.id);
  const done = stats.challenge_progress >= stats.challenge_target;
  const text = trc({
    title: 'Daily Challenge', emoji: '🎯',
    intro: 'Complete today’s challenge before the daily reset.',
    sections: [{ title: 'Mission', emoji: '🔥', content: `<b>Win ${stats.challenge_target} games today</b>\n<code>${progressBar(stats.challenge_progress, stats.challenge_target)}</code>\n${stats.challenge_progress}/${stats.challenge_target} completed\n\n🎁 Reward: <b>+${stats.challenge_reward} points</b>` }],
    footer: done ? '✅ Completed — reward already credited.' : 'Play a game now and your progress updates automatically.'
  });
  await ctx.editMessageText(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[styledCallback('🎮 Play Games', 'nav_games')],
    [styledCallback('⚔️ War / PvP', 'nav_war')],[styledCallback('⬅ Back', 'nav_home')]]) }).catch(() => {});
  await ctx.answerCbQuery().catch(() => {});
});

bot.action('nav_achievements', async (ctx) => {
  const summary = db.statsSummary(ctx.from.id);
  const unlocked = new Set(summary.achievements.map(a => a.achievement_key));
  const items = Object.entries(db.ACHIEVEMENTS).map(([key, value]) => `${unlocked.has(key) ? '🏅' : '▫️'} <b>${escapeHtml(value[0])}</b> — ${escapeHtml(value[1])}`);
  const text = trc({ title: 'Achievements', emoji: '🏅', intro: 'Permanent badges earned from milestones.', sections: [{ title: `${summary.achievements.length}/${Object.keys(db.ACHIEVEMENTS).length} unlocked`, emoji: '✨', items }], footer: 'More wins, streaks and challenges unlock more badges.' });
  await ctx.editMessageText(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[styledCallback('⬅ Back', 'nav_home')]]) }).catch(() => {});
  await ctx.answerCbQuery().catch(() => {});
});

bot.action('nav_mystery', async (ctx) => {
  const user = db.getUser(ctx.from.id) || { points: 0 };
  const stats = db.getStats(ctx.from.id);
  const text = trc({ title: 'Mystery Box', emoji: '🎁', intro: 'Spend 50 points for a chance at a bigger reward.', sections: [{ title: 'Possible Rewards', emoji: '✨', items: ['60 points — Common', '150 points — Rare', '400 points — Epic', '1,000 points — Legendary 👑'] }, { title: 'Your Balance', emoji: '💰', content: `<b>${user.points} points</b> · Opened ${stats.mystery_opened} boxes` }], footer: 'Rewards are random and the cost is always 50 points.' });
  await ctx.editMessageText(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[styledCallback('🎁 Open for 50 pts', 'mystery_open')],[styledCallback('⬅ Back', 'nav_home')]]) }).catch(() => {});
  await ctx.answerCbQuery().catch(() => {});
});

bot.action('mystery_open', async (ctx) => {
  const result = db.openMysteryBoxTxn(ctx.from.id, 50);
  if (!result.ok) return ctx.answerCbQuery('❌ You need at least 50 points.', { show_alert: true }).catch(() => {});
  const r = result.reward;
  const text = trc({ title: 'Mystery Box Opened!', emoji: '🎁', intro: `Rarity: <b>${r.rarity}</b>`, sections: [{ title: 'Reward', emoji: '💰', content: `<b>+${r.points} points</b>` }, { title: 'Balance', emoji: '🏦', content: `<b>${result.user.points} points</b>` }], footer: 'Try again when you have enough points.' });
  await ctx.editMessageText(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[styledCallback('🎁 Open Another', 'mystery_open')],[styledCallback('⬅ Back', 'nav_home')]]) }).catch(() => {});
  await ctx.answerCbQuery('🎉 Reward unlocked!').catch(() => {});
});

// ============================================================
// ADMIN COMMANDS
// ============================================================
bot.command('admin', async (ctx) => {
  if (!adminGuard(ctx)) return ctx.reply(tiny('❌ ᴀᴅᴍɪɴ ᴏɴʟʏ.'));
  return ctx.reply(adminCenterText(), { parse_mode: 'HTML', ...Markup.inlineKeyboard([
    [styledCallback('👑 ʀᴇғʀᴇsʜ ᴘʟᴀʏᴇʀs', 'admin_center')],
    [styledCallback('📋 ᴠɪᴇᴡ ʜɪɢʜ ᴘᴏɪɴᴛs', 'admin_high_points')]
  ]) });
});
bot.command('vipusers', async (ctx) => {
  if (!adminGuard(ctx)) return ctx.reply(tiny('❌ ᴀᴅᴍɪɴ ᴏɴʟʏ.'));
  const users = db.highPointUsers(adminMinPoints(), 100);
  const lines = users.length ? users.map((u, i) => `${i + 1}. ${adminPlayerLabel(u)}`) : [tiny('ɴᴏ ʜɪɢʜ-ᴘᴏɪɴᴛ ᴘʟᴀʏᴇʀs.')];
  return ctx.reply(trc({ title: 'ʜɪɢʜ-ᴘᴏɪɴᴛ ᴘʟᴀʏᴇʀs', emoji: '💰', intro: `ᴛʜʀᴇsʜᴏʟᴅ: <b>${adminMinPoints()}+</b>`, sections: [{ title: 'Players', emoji: '👤', items: lines }], footer: tiny('ᴜsᴇ /ɢɪғᴛ <ɪᴅ> ᴛᴏ sᴇɴᴅ ᴀɴʏ ᴛᴇʟᴇɢʀᴀᴍ ɢɪғᴛ.') }), { parse_mode: 'HTML' });
});
bot.action('admin_center', async (ctx) => {
  if (!adminGuard(ctx)) return;
  await ctx.editMessageText(adminCenterText(), { parse_mode: 'HTML', ...Markup.inlineKeyboard([
    [styledCallback('👑 ʀᴇғʀᴇsʜ ᴘʟᴀʏᴇʀs', 'admin_center')],
    [styledCallback('📋 ᴠɪᴇᴡ ʜɪɢʜ ᴘᴏɪɴᴛs', 'admin_high_points')]
  ]) }).catch(() => {});
  await ctx.answerCbQuery().catch(() => {});
});
bot.action('admin_high_points', async (ctx) => {
  if (!adminGuard(ctx)) return;
  const users = db.highPointUsers(adminMinPoints(), 20);
  const rows = users.map(u => [styledCallback(`🎁 ${u.username ? '@'+u.username : u.user_id} · ${u.points}`, `admin_gift:${u.user_id}`)]);
  rows.push([styledCallback('🔄 ʀᴇғʀᴇsʜ', 'admin_high_points')]);
  rows.push([styledCallback('👑 ᴀᴅᴍɪɴ ᴄᴇɴᴛᴇʀ', 'admin_center')]);
  const text = trc({ title: 'ʜɪɢʜ-ᴘᴏɪɴᴛ ᴘʟᴀʏᴇʀs', emoji: '💰', intro: `ᴘʟᴀʏᴇʀs ᴡɪᴛʜ <b>${adminMinPoints()}+</b> ᴘᴏɪɴᴛs`, sections: [{ title: 'Players', emoji: '👤', items: users.length ? users.map(u => adminPlayerLabel(u)) : [tiny('ɴᴏ ᴘʟᴀʏᴇʀs ʏᴇᴛ.')] }], footer: tiny('ᴛᴀᴘ ᴀ ᴘʟᴀʏᴇʀ ᴛᴏ sᴇɴᴅ ᴀ ɢɪғᴛ.') });
  await ctx.editMessageText(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard(rows) }).catch(() => {});
  await ctx.answerCbQuery().catch(() => {});
});
bot.action(/^admin_gift:(\d+)$/, async (ctx) => {
  if (!adminGuard(ctx)) return;
  const userId = Number(ctx.match[1]);
  const user = db.getUser(userId);
  if (!user) return ctx.answerCbQuery(tiny('ᴜsᴇʀ ɴᴏᴛ ғᴏᴜɴᴅ.'), { show_alert: true }).catch(() => {});
  awaitingAdminGift.set(ctx.from.id, userId);
  await ctx.answerCbQuery(tiny('ɢɪғᴛ ᴍᴏᴅᴇ ᴀᴄᴛɪᴠᴇ.'), { show_alert: true }).catch(() => {});
  return ctx.reply(trc({ title: 'sᴇɴᴅ ɢɪғᴛ', emoji: '🎁', intro: `ᴛᴀʀɢᴇᴛ: ${adminPlayerLabel(user)}`, sections: [{ title: 'What To Send', emoji: '📦', items: [tiny('sᴇɴᴅ ᴀ ᴢɪᴘ, ғɪʟᴇ, ᴘʜᴏᴛᴏ, ᴠɪᴅᴇᴏ, ᴀᴜᴅɪᴏ, ᴠᴏɪᴄᴇ, sᴛɪᴄᴋᴇʀ ᴏʀ ᴛᴇxᴛ ᴍᴇssᴀɢᴇ.'), tiny('ᴛʜᴇ ʙᴏᴛ ᴡɪʟʟ ᴄᴏᴘʏ ɪᴛ ᴅɪʀᴇᴄᴛʟʏ ᴛᴏ ᴛʜᴇ ᴘʟᴀʏᴇʀ.'), tiny('ᴜsᴇ /ᴄᴀɴᴄᴇʟɢɪғᴛ ᴛᴏ sᴛᴏᴘ.')] }], footer: tiny('ɢɪғᴛ ᴍᴏᴅᴇ ɪs ᴏɴʟʏ ᴜsᴇᴅ ғᴏʀ ᴛʜɪs ᴀᴅᴍɪɴ.') }), { parse_mode: 'HTML' });
});
bot.command('gift', async (ctx) => {
  if (!adminGuard(ctx)) return ctx.reply(tiny('❌ ᴀᴅᴍɪɴ ᴏɴʟʏ.'));
  const raw = ctx.message.text.replace(/^\/gift(?:@\w+)?\s*/i, '').trim();
  const target = /^\d+$/.test(raw) ? db.getUser(Number(raw)) : db.findUserByUsername(raw);
  if (!target) return ctx.reply(tiny('ᴜsᴇʀ ɴᴏᴛ ғᴏᴜɴᴅ. ᴜsᴇ ᴛʜᴇɪʀ ᴜsᴇʀ ɪᴅ ᴏʀ @ᴜsᴇʀɴᴀᴍᴇ.'));
  awaitingAdminGift.set(ctx.from.id, target.user_id);
  return ctx.reply(trc({ title: 'sᴇɴᴅ ɢɪғᴛ', emoji: '🎁', intro: `ᴛᴀʀɢᴇᴛ: ${adminPlayerLabel(target)}`, sections: [{ title: 'Send Anything', emoji: '📦', items: [tiny('ᴢɪᴘ / ғɪʟᴇ / ᴘʜᴏᴛᴏ / ᴠɪᴅᴇᴏ / ᴀᴜᴅɪᴏ / ᴠᴏɪᴄᴇ / sᴛɪᴄᴋᴇʀ / ᴛᴇxᴛ.'), tiny('ᴛʜᴇ ʙᴏᴛ ᴡɪʟʟ ᴄᴏᴘʏ ʏᴏᴜʀ ɴᴇxᴛ ᴍᴇssᴀɢᴇ ᴛᴏ ᴛʜᴇ ᴜsᴇʀ.')] }], footer: tiny('ᴜsᴇ /ᴄᴀɴᴄᴇʟɢɪғᴛ ᴛᴏ ᴄᴀɴᴄᴇʟ.') }), { parse_mode: 'HTML' });
});
bot.command(['addstorefile','addproduct'], async (ctx) => {
  if (!adminGuard(ctx)) return ctx.reply(tiny('❌ ᴀᴅᴍɪɴ ᴏɴʟʏ.'));
  awaitingStoreFile.set(ctx.from.id, { step: 'category' });
  const cats = economy.getCategories().slice(0, 60);
  const lines = cats.map(c => `${c.id}. ${c.name}`).join('\n');
  return ctx.reply(trc({ title: 'ᴀᴅᴅ sᴛᴏʀᴇ ғɪʟᴇ', emoji: '📦', intro: 'ᴄʀᴇᴀᴛᴇ ᴀ sᴛᴏʀᴇ ɪᴛᴇᴍ ᴛʜᴀᴛ ᴅᴇʟɪᴠᴇʀs ᴀ ғɪʟᴇ ᴀғᴛᴇʀ ᴘᴜʀᴄʜᴀsᴇ.', sections: [{ title: '1 · ᴄʜᴏᴏsᴇ ᴄᴀᴛᴇɢᴏʀʏ', emoji: '📁', content: `<code>${escapeHtml(lines)}</code>` }], footer: tiny('ʀᴇᴘʟʏ ᴡɪᴛʜ ᴛʜᴇ ᴄᴀᴛᴇɢᴏʀʏ ɪᴅ · ᴜsᴇ /ᴄᴀɴᴄᴇʟsᴛᴏʀᴇ ᴛᴏ sᴛᴏᴘ.') }), { parse_mode: 'HTML' });
});
bot.command('cancelstore', async (ctx) => {
  if (!adminGuard(ctx)) return ctx.reply(tiny('❌ ᴀᴅᴍɪɴ ᴏɴʟʏ.'));
  awaitingStoreFile.delete(ctx.from.id);
  return ctx.reply(tiny('🚫 sᴛᴏʀᴇ ғɪʟᴇ ᴡɪᴢᴀʀᴅ ᴄᴀɴᴄᴇʟʟᴇᴅ.'));
});

// Admin wizard: category -> name -> description -> price -> stock -> file.
bot.on('message', async (ctx, next) => {
  const state = awaitingStoreFile.get(ctx.from?.id);
  if (!state || !isAdmin(ctx.from?.id)) return next();
  const text = String(ctx.message?.text || '').trim();
  if (/^\/cancelstore(?:@\w+)?$/i.test(text)) { awaitingStoreFile.delete(ctx.from.id); return ctx.reply(tiny('🚫 sᴛᴏʀᴇ ᴡɪᴢᴀʀᴅ ᴄᴀɴᴄᴇʟʟᴇᴅ.')); }
  try {
    if (state.step === 'category') {
      const id = Number(text); const cat = economy.getCategories().find(x => x.id === id);
      if (!cat) return ctx.reply(tiny('❌ ɪɴᴠᴀʟɪᴅ ᴄᴀᴛᴇɢᴏʀʏ ɪᴅ. ʀᴇᴘʟʏ ᴡɪᴛʜ ᴏɴᴇ ᴏғ ᴛʜᴇ ʟɪsᴛ.'));
      state.categoryId=id; state.step='name';
      return ctx.reply(tiny(`✅ ${cat.name}\n\n2 · sᴇɴᴅ ᴛʜᴇ sᴛᴏʀᴇ ɪᴛᴇᴍ ɴᴀᴍᴇ.`));
    }
    if (state.step === 'name') {
      if (!text || text.length > 100) return ctx.reply(tiny('❌ ɴᴀᴍᴇ ᴍᴜsᴛ ʙᴇ 1–100 ᴄʜᴀʀᴀᴄᴛᴇʀs.'));
      state.name=text; state.step='description';
      return ctx.reply(tiny('3 · sᴇɴᴅ ᴀ sʜᴏʀᴛ ᴅᴇsᴄʀɪᴘᴛɪᴏɴ. ᴜsᴇ - ғᴏʀ ɴᴏ ᴅᴇsᴄʀɪᴘᴛɪᴏɴ.'));
    }
    if (state.step === 'description') {
      state.description = text === '-' ? '' : text.slice(0,500); state.step='price';
      return ctx.reply(tiny('4 · sᴇɴᴅ ᴛʜᴇ ᴘʀɪᴄᴇ ɪɴ ʀᴜsʜ ᴘᴏɪɴᴛs.'));
    }
    if (state.step === 'price') {
      const price=Math.trunc(Number(text)); if(!Number.isFinite(price)||price<0) return ctx.reply(tiny('❌ ᴘʀɪᴄᴇ ᴍᴜsᴛ ʙᴇ 0 ᴏʀ ʜɪɢʜᴇʀ.'));
      state.price=price; state.step='stock';
      return ctx.reply(tiny('5 · sᴇɴᴅ sᴛᴏᴄᴋ. ᴜsᴇ -1 ғᴏʀ ᴜɴʟɪᴍɪᴛᴇᴅ.'));
    }
    if (state.step === 'stock') {
      const stock=Math.trunc(Number(text)); if(!Number.isFinite(stock)||stock===0||stock < -1) return ctx.reply(tiny('❌ sᴛᴏᴄᴋ ᴍᴜsᴛ ʙᴇ -1 ᴏʀ ᴀ ᴘᴏsɪᴛɪᴠᴇ ɴᴜᴍʙᴇʀ.'));
      state.stock=stock; state.step='file';
      return ctx.reply(tiny('6 · ɴᴏᴡ sᴇɴᴅ ᴛʜᴇ ғɪʟᴇ/ᴢɪᴘ/ᴘʜᴏᴛᴏ/ᴠɪᴅᴇᴏ/ᴀᴜᴅɪᴏ ᴛᴏ ᴅᴇʟɪᴠᴇʀ ᴀғᴛᴇʀ ᴘᴜʀᴄʜᴀsᴇ.'));
    }
    if (state.step === 'file') {
      let type=null, fileId=null, fileName='';
      const m=ctx.message;
      if(m.document){type='document';fileId=m.document.file_id;fileName=m.document.file_name||'';}
      else if(m.photo?.length){type='photo';fileId=m.photo[m.photo.length-1].file_id;}
      else if(m.video){type='video';fileId=m.video.file_id;fileName=m.video.file_name||'';}
      else if(m.audio){type='audio';fileId=m.audio.file_id;fileName=m.audio.file_name||'';}
      else if(text){type='license';fileId=text;fileName='license-keys';}
      else return ctx.reply(tiny('❌ sᴇɴᴅ ᴀ ғɪʟᴇ ᴏʀ ᴘᴀsᴛ ʟɪᴄᴇɴsᴇ ᴋᴇʏs, ᴏɴᴇ ᴘᴇʀ ʟɪɴᴇ.'));
      const r=economy.createDigitalProduct({categoryId:state.categoryId,name:state.name,description:state.description,price:state.price,stock:state.stock,fulfillmentType:type,fileId,fileName,caption:`🎁 <b>${escapeHtml(state.name)}</b>\n\nᴛʜᴀɴᴋ ʏᴏᴜ ғᴏʀ sʜᴏᴘᴘɪɴɢ ᴡɪᴛʜ ʀᴜsʜ! ᴡᴇ ʜᴏᴘᴇ ʏᴏᴜ ᴇɴᴊᴏʏ ʏᴏᴜʀ ɢɪғᴛ.`,});if(r.ok && type==='license'){const kr=economy.addLicenseKeys(r.product.id,text.split(/\r?\n/));if(!kr.added){await ctx.reply(tiny('❌ ɴᴏ ᴠᴀʟɪᴅ ʟɪᴄᴇɴsᴇ ᴋᴇʏs ᴡᴇʀᴇ ᴀᴅᴅᴇᴅ.'));}}
      awaitingStoreFile.delete(ctx.from.id);
      if(!r.ok) return ctx.reply(tiny('❌ ᴄᴏᴜʟᴅ ɴᴏᴛ ᴄʀᴇᴀᴛᴇ ᴛʜᴇ sᴛᴏʀᴇ ɪᴛᴇᴍ.'));
      return ctx.reply(trc({title:'sᴛᴏʀᴇ ɪᴛᴇᴍ ᴀᴅᴅᴇᴅ',emoji:'✅',intro:`<b>#${r.product.id}</b> · ${escapeHtml(r.product.name)}`,sections:[{title:'ᴅᴇʟɪᴠᴇʀʏ',emoji:'🎁',items:[`${r.product.price} ᴘᴛs`,state.stock<0?'ᴜɴʟɪᴍɪᴛᴇᴅ sᴛᴏᴄᴋ':`${state.stock} ɪɴ sᴛᴏᴄᴋ`,`ᴀᴜᴛᴏ-ᴅᴇʟɪᴠᴇʀʏ: ${type}`]}],footer:tiny('ᴡʜᴇɴ ᴀ ᴜsᴇʀ ʙᴜʏs ɪᴛ, ᴛʜᴇ ʙᴏᴛ ᴡɪʟʟ sᴇɴᴅ ᴛʜᴇ ғɪʟᴇ ᴀɴᴅ ᴀ ᴛʜᴀɴᴋ-ʏᴏᴜ ᴍᴇssᴀɢᴇ.') }),{parse_mode:'HTML'});
    }
  } catch(err) { console.error('Store file wizard error:',err); awaitingStoreFile.delete(ctx.from.id); return ctx.reply(tiny('❌ ᴀɴ ᴇʀʀᴏʀ ᴏᴄᴄᴜʀʀᴇᴅ. ᴛʀʏ /ᴀᴅᴅsᴛᴏʀᴇғɪʟᴇ ᴀɢᴀɪɴ.')); }
});

async function sendStoreDelivery(ctx, delivery){
  if(!delivery) return false;
  if(delivery.type==='license'){ await ctx.reply(tiny(`🔑 ʏᴏᴜʀ ʟɪᴄᴇɴsᴇ ᴋᴇʏ:\n\n${delivery.fileId}`)); return true; }
  const opts=delivery.caption?{caption:delivery.caption,parse_mode:'HTML'}:{};
  if(delivery.type==='photo') await ctx.replyWithPhoto(delivery.fileId,opts);
  else if(delivery.type==='video') await ctx.replyWithVideo(delivery.fileId,opts);
  else if(delivery.type==='audio') await ctx.replyWithAudio(delivery.fileId,opts);
  else await ctx.replyWithDocument(delivery.fileId,opts);
  return true;
}
function ownerDmKeyboard(){const ownerId=String((process.env.ADMIN_USER_IDS||'').split(',').map(x=>x.trim()).find(Boolean)||'');return ownerId?{reply_markup:{inline_keyboard:[[{text:'👤 ᴅᴍ ᴍʏ ᴏᴡɴᴇʀ',url:`tg://user?id=${ownerId}`,style:'primary'}]]}}:{};}

bot.command('purchases', async ctx=>{
  const items=economy.listPurchasedProducts(ctx.from.id); if(!items.length)return ctx.reply(tiny('📦 ʏᴏᴜ ʜᴀᴠᴇ ɴᴏ ᴘᴜʀᴄʜᴀsᴇs ʏᴇᴛ.'));
  const rows=items.slice(0,20).map(p=>[styledCallback(`🔄 ${p.name}`,`store_redownload:${p.id}`),styledCallback('⭐ ʀᴀᴛᴇ',`store_rate:${p.id}`)]);
  return ctx.reply(trc({title:'ʏᴏᴜʀ ᴘᴜʀᴄʜᴀsᴇs',emoji:'📦',intro:tiny('ʀᴇᴅᴏᴡɴʟᴏᴀᴅ ᴘʀᴇᴠɪᴏᴜs ɢɪғᴛs ᴏʀ ʀᴀᴛᴇ ᴀɴ ɪᴛᴇᴍ.')}),{parse_mode:'HTML',...Markup.inlineKeyboard(rows)});
});
bot.action(/^store_redownload:(\d+)$/,async ctx=>{const d=economy.getDeliveryForReDownload(ctx.from.id,Number(ctx.match[1]));if(!d)return ctx.answerCbQuery('No downloadable file is available.',{show_alert:true});try{await sendStoreDelivery(ctx,d);await ctx.answerCbQuery('🎁 Sent again!');}catch(e){await ctx.answerCbQuery('Delivery failed.',{show_alert:true});}});
bot.action(/^store_rate:(\d+)$/,async ctx=>{return ctx.reply(tiny(`⭐ ʀᴀᴛᴇ ᴘʀᴏᴅᴜᴄᴛ #${ctx.match[1]}\n\nᴜsᴇ: /rate ${ctx.match[1]} <1-5> [review]`));});
bot.command('rate',ctx=>{const a=ctx.message.text.trim().split(/\s+/).slice(1);if(a.length<2)return ctx.reply(tiny('ᴜsᴇ: /rate <product_id> <1-5> [review]'));const r=economy.rateProduct(ctx.from.id,Number(a[0]),Number(a[1]),a.slice(2).join(' '));return ctx.reply(tiny(r.ok?'⭐ ʀᴀᴛɪɴɢ sᴀᴠᴇᴅ. ᴛʜᴀɴᴋ ʏᴏᴜ!':r.reason==='purchase'?'❌ ʙᴜʏ ᴛʜᴇ ɪᴛᴇᴍ ғɪʀsᴛ.':'❌ ʀᴀᴛɪɴɢ ᴍᴜsᴛ ʙᴇ 1–5.'));});
bot.command('featured',ctx=>{const ps=economy.featuredProducts(10);if(!ps.length)return ctx.reply(tiny('🔥 ɴᴏ ғᴇᴀᴛᴜʀᴇᴅ ɪᴛᴇᴍs ʏᴇᴛ.'));return ctx.reply(trc({title:'🔥 ғᴇᴀᴛᴜʀᴇᴅ & ʙᴇsᴛsᴇʟʟᴇʀs',emoji:'🔥',sections:[{title:'ᴛᴏᴘ ɪᴛᴇᴍs',items:ps.map((p,i)=>`${i+1}. <b>${escapeHtml(p.name)}</b> · ${p.price} ᴘᴛs · 🛒 ${p.sold} sold · ⭐ ${Number(p.rating||0).toFixed(1)}`)}]}),{parse_mode:'HTML'});});
bot.command('rateproduct',ctx=>ctx.reply(tiny('⭐ ᴜsᴇ /ʀᴀᴛᴇ <product_id> <1-5> [review].')));
bot.command('giftpurchase',ctx=>{const a=ctx.message.text.replace(/^\/giftpurchase(?:@\w+)?\s*/i,'').trim().split(/\s+/);if(a.length<3)return ctx.reply(tiny('ᴜsᴇ: /ɢɪғᴛᴘᴜʀᴄʜᴀsᴇ <@username|user_id> <product_id> [qty] [discount]'));const target=/^\d+$/.test(a[0])?db.getUser(Number(a[0])):db.findUserByUsername(a[0]);if(!target)return ctx.reply(tiny('❌ ʀᴇᴄɪᴘɪᴇɴᴛ ɴᴏᴛ ғᴏᴜɴᴅ.'));const r=economy.giftPurchase(ctx.from.id,target.user_id,Number(a[1]),Number(a[2]||1),a[3]||'');if(!r.ok)return ctx.reply(tiny(r.reason==='points'?'❌ ɴᴏᴛ ᴇɴᴏᴜɢʜ ᴘᴏɪɴᴛs.':r.reason==='stock'?'❌ ɴᴏᴛ ᴇɴᴏᴜɢʜ sᴛᴏᴄᴋ.':r.reason==='discount'?'❌ ɪɴᴠᴀʟɪᴅ/ᴇxᴘɪʀᴇᴅ ᴅɪsᴄᴏᴜɴᴛ.':'❌ ᴄᴏᴜʟᴅ ɴᴏᴛ ɢɪғᴛ ᴛʜɪs ɪᴛᴇᴍ.'));return ctx.reply(tiny(`🎁 ɢɪғᴛ ᴘᴜʀᴄʜᴀsᴇᴅ ғᴏʀ ${target.username?'@'+target.username:target.user_id}!\n💰 ${r.total} ᴘᴛs`));});

bot.command('creatediscount',ctx=>{if(!adminGuard(ctx))return ctx.reply(tiny('❌ ᴀᴅᴍɪɴ ᴏɴʟʏ.'));const a=ctx.message.text.trim().split(/\s+/).slice(1);if(a.length<2)return ctx.reply(tiny('ᴜsᴇ: /creatediscount <CODE> <percent> [max_uses] [expires YYYY-MM-DD]'));const r=economy.createDiscountCode(a[0],Number(a[1]),Number(a[2]||-1),a[3]?a[3]+' 23:59:59':null);return ctx.reply(tiny(r.ok?`🏷️ ᴅɪsᴄᴏᴜɴᴛ ${a[0].toUpperCase()} ᴄʀᴇᴀᴛᴇᴅ.`:r.reason==='exists'?'❌ ᴄᴏᴅᴇ ᴀʟʀᴇᴀᴅʏ ᴇxɪsᴛs.':'❌ ɪɴᴠᴀʟɪᴅ ᴅɪsᴄᴏᴜɴᴛ.'));});
bot.command('featureproduct',ctx=>{if(!adminGuard(ctx))return ctx.reply(tiny('❌ ᴀᴅᴍɪɴ ᴏɴʟʏ.'));const a=ctx.message.text.trim().split(/\s+/).slice(1);if(!a[0])return ctx.reply(tiny('ᴜsᴇ: /featureproduct <product_id> [on|off]'));const r=economy.setFeatured(Number(a[0]),(a[1]||'on').toLowerCase()!=='off');return ctx.reply(tiny(r.ok?'🔥 ᴘʀᴏᴅᴜᴄᴛ ғᴇᴀᴛᴜʀᴇ sᴛᴀᴛᴜs ᴜᴘᴅᴀᴛᴇᴅ.':'❌ ᴘʀᴏᴅᴜᴄᴛ ɴᴏᴛ ғᴏᴜɴᴅ.'));});

bot.command('cancelgift', async (ctx) => {
  if (!adminGuard(ctx)) return;
  awaitingAdminGift.delete(ctx.from.id);
  return ctx.reply(tiny('🚫 ɢɪғᴛ ᴍᴏᴅᴇ ᴄᴀɴᴄᴇʟʟᴇᴅ.'));
});
bot.command('giftpoints', async (ctx) => {
  if (!adminGuard(ctx)) return ctx.reply(tiny('❌ ᴀᴅᴍɪɴ ᴏɴʟʏ.'));
  const parts = ctx.message.text.trim().split(/\s+/).slice(1);
  if (parts.length < 2) return ctx.reply(tiny('ᴜsᴇ: /ɢɪғᴛᴘᴏɪɴᴛs <ᴜsᴇʀ_ɪᴅ> <ᴀᴍᴏᴜɴᴛ>'));
  const userId = Number(parts[0]); const amount = Number(parts[1]);
  const result = db.addGiftPoints(userId, amount, 'admin_gift', `admin:${ctx.from.id}`);
  if (!result.ok) return ctx.reply(tiny(result.reason === 'user_not_found' ? 'ᴜsᴇʀ ɴᴏᴛ ғᴏᴜɴᴅ.' : 'ɪɴᴠᴀʟɪᴅ ᴀᴍᴏᴜɴᴛ.'));
  try { await bot.telegram.sendMessage(userId, trc({ title: '🎁 ʀᴜsʜ ɢɪғᴛ', intro: `ʏᴏᴜ ʀᴇᴄᴇɪᴠᴇᴅ <b>+${result.amount} ᴘᴏɪɴᴛs</b> ғʀᴏᴍ ʀᴜsʜ ᴀᴅᴍɪɴ.`, footer: tiny('ᴇɴᴊᴏʏ ʏᴏᴜʀ ʀᴇᴡᴀʀᴅ!') }), { parse_mode: 'HTML' }); } catch (_) {}
  return ctx.reply(tiny(`🎁 ɢɪғᴛᴇᴅ +${result.amount} ᴘᴏɪɴᴛs ᴛᴏ ${userId}.`));
});


// Admin: inspect pending point withdrawal requests.
bot.command('withdrawals', async ctx => { if(!adminGuard(ctx)) return ctx.reply(tiny('❌ ᴀᴅᴍɪɴ ᴏɴʟʏ.')); const rows=economy.listWithdrawals(50); const lines=rows.length?rows.map(w=>`#${w.id} · <code>${w.user_id}</code> · ${w.username?'@'+escapeHtml(w.username):tiny('ɴᴏ ᴜsᴇʀɴᴀᴍᴇ')} · <b>${w.amount} ᴘᴛs</b> · ${w.status}`):[tiny('ɴᴏ ᴡɪᴛʜᴅʀᴀᴡᴀʟ ʀᴇǫᴜᴇs.')]; return ctx.reply(trc({title:'ᴘᴇɴᴅɪɴɢ ᴡɪᴛʜᴅʀᴀᴡᴀʟs',emoji:'💸',sections:[{title:'Requests',emoji:'📋',items:lines}],footer:tiny('ʀᴇᴠɪᴇᴡ ᴀɴᴅ ᴘʀᴏᴄᴇss ᴘᴀʏᴏᴜᴛs ᴏᴜᴛsɪᴅᴇ ᴛʜᴇ ʙᴏᴛ.') }),{parse_mode:'HTML'}); });


bot.command('storesearch',ctx=>{const q=ctx.message.text.trim().split(/\s+/).slice(1).join(' ').toLowerCase();if(!q)return ctx.reply(tiny('ᴜsᴇ: /sᴛᴏʀᴇsᴇᴀʀᴄʜ <ɪᴛᴇᴍ>'));const rows=economy.getCategories().flatMap(c=>economy.getProducts(c.id)).filter(x=>(x.name+' '+(x.description||'')).toLowerCase().includes(q)).slice(0,15);return ctx.reply(rows.length?rows.map(x=>`🛍️ #${x.id} · ${x.name} — ${x.price} ᴘᴛs`).join('\n'):tiny('🔎 ɴᴏ ɪᴛᴇᴍs ғᴏᴜɴᴅ.'));});
bot.command('economyadmin',ctx=>{if(!adminGuard(ctx))return ctx.reply(tiny('❌ ᴀᴅᴍɪɴ ᴏɴʟʏ.'));const s=economy.adminStoreStats();return ctx.reply(trc({title:'ʀᴜsʜ ᴇᴄᴏɴᴏᴍʏ ᴅᴀsʜʙᴏᴀʀᴅ',emoji:'📊',sections:[{title:'Store',emoji:'🛒',items:[`ᴘʀᴏᴅᴜᴄᴛs: <b>${s.products}</b>`,`ᴏʀᴅᴇʀs: <b>${s.orders}</b>`,`ᴘᴏɪɴᴛs sᴘᴇɴᴛ: <b>${s.sales}</b>`,`ɪɴᴠᴇɴᴛᴏʀʏ ɪᴛᴇᴍs: <b>${s.inventory}</b>`,`ᴘᴇɴᴅɪɴɢ ᴄᴀsʜᴏᴜᴛs: <b>${s.pending}</b>`]}],footer:tiny('ᴜsᴇ ᴛʜɪs ᴛᴏ ᴍᴏɴɪᴛᴏʀ ʀᴜsʜ ᴇᴄᴏɴᴏᴍʏ.') }),{parse_mode:'HTML'});});
// ============================================================
// PVP WARS
// ============================================================

const WAR_IMAGE = process.env.WAR_MENU_IMAGE_URL || process.env.MENU_IMAGE_URL || null;
const warChoiceButtons = (warId) => Markup.inlineKeyboard([
  [styledCallback('✊ Rock', `war_move:${warId}:rock`), styledCallback('📄 Paper', `war_move:${warId}:paper`)],
  [styledCallback('✂️ Scissors', `war_move:${warId}:scissors`)],
  [styledCallback('🏠 Main Menu', 'nav_home')],
]);

async function sendWarMessage(chatId, text, keyboard) {
  const opts = { parse_mode: 'HTML', ...(keyboard || {}) };
  if (WAR_IMAGE) return bot.telegram.sendPhoto(chatId, WAR_IMAGE, { caption: text, ...opts }).catch(() => bot.telegram.sendMessage(chatId, text, opts));
  return bot.telegram.sendMessage(chatId, text, opts);
}

function userDisplay(user) {
  return user?.username ? `@${escapeHtml(user.username)}` : `<code>${user?.user_id || ''}</code>`;
}

async function showWarMenu(ctx) {
  const active = db.activeWarForUser(ctx.from.id);
  const text = trc({
    title: 'War Arena', emoji: '⚔️',
    intro: tiny('Challenge any player who has started the bot. The opponent must accept before the war begins.'),
    sections: [
      { title: 'How It Works', emoji: '📜', items: [tiny('Use /war @username to challenge a player.'), tiny('They receive a notification with Accept and Decline.'), tiny('Accepted wars are best-of-5 Rock Paper Scissors.'), tiny('First player to 3 round wins takes the war.')] },
      ...(active ? [{ title: 'Active War', emoji: '🔥', content: `<b>War #${active.id}</b> · ${active.challenger_score}-${active.opponent_score}` }] : []),
    ],
    footer: tiny('Only users who have started the bot can be challenged.'),
  });
  const kb = Markup.inlineKeyboard([[styledCallback('⚔️ How to Challenge', 'war_help')],[styledCallback('🏠 Main Menu', 'nav_home')]]);
  if (ctx.callbackQuery) {
    if (WAR_IMAGE) {
      return ctx.replyWithPhoto(WAR_IMAGE, { caption: text, parse_mode: 'HTML', ...kb }).catch(() => ctx.editMessageText(text, { parse_mode: 'HTML', ...kb }));
    }
    return ctx.editMessageText(text, { parse_mode: 'HTML', ...kb }).catch(() => ctx.reply(text, { parse_mode: 'HTML', ...kb }));
  }
  return sendWarMessage(ctx.chat.id, text, kb);
}

bot.command('war', async (ctx) => {
  const raw = ctx.message.text.replace(/^\/war(?:@\w+)?\s*/i, '').trim();
  if (!raw) return sendWarMessage(ctx.chat.id, trc({ title: 'Start a War', emoji: '⚔️', intro: tiny('Challenge a player by username.'), sections: [{ title: 'Example', emoji: '💡', content: '<code>/war @username</code>' }], footer: tiny('The player must have started this bot first.') }), Markup.inlineKeyboard([[styledCallback('⚔️ War Arena', 'nav_war')]]));
  const target = db.findUserByUsername(raw);
  const challenger = db.getOrCreateUser(ctx.from.id, ctx.from.username || ctx.from.first_name);
  if (!target) return sendWarMessage(ctx.chat.id, trc({ title: 'Player Not Found', emoji: '❌', intro: tiny('I could not find that username among players who have started the bot.'), footer: tiny('Ask them to open the bot and press Start first.') }));
  if (target.user_id === ctx.from.id) return sendWarMessage(ctx.chat.id, trc({ title: 'Invalid War', emoji: '⚠️', intro: tiny('You cannot declare war on yourself.') }));
  const result = db.createWar(ctx.from.id, target.user_id);
  if (!result.ok) return sendWarMessage(ctx.chat.id, trc({ title: 'War Already Exists', emoji: '⚠️', intro: tiny('You already have a pending or active war with this player.'), sections: [{ title: 'War', emoji: '⚔️', content: `<b>#${result.war.id}</b>` }] }));
  const war = result.war;
  const challengerName = userDisplay(challenger);
  const caption = trc({ title: 'WAR DECLARED!', emoji: '⚔️', intro: `${challengerName} ${tiny('has challenged you to a war!')}`, sections: [{ title: 'Battle', emoji: '🔥', content: tiny('Best-of-5 Rock Paper Scissors. First to 3 wins.') }, { title: 'War ID', emoji: '🆔', content: `<code>#${war.id}</code>` }], footer: tiny('Accept to enter the arena or decline to refuse this challenge.') });
  const kb = Markup.inlineKeyboard([[styledCallback('⚔️ ACCEPT WAR', `war_accept:${war.id}`), styledCallback('❌ DECLINE', `war_decline:${war.id}`)]]);
  await sendWarMessage(target.user_id, caption, kb);
  await sendWarMessage(ctx.chat.id, trc({ title: 'WAR SENT!', emoji: '⚔️', intro: `${userDisplay(target)} ${tiny('has been notified.')}`, sections: [{ title: 'Status', emoji: '⏳', content: `<b>Pending</b> · War #${war.id}` }], footer: tiny('You will be notified when they accept or decline.') }), Markup.inlineKeyboard([[styledCallback('⚔️ War Arena', 'nav_war')]]));
});

bot.action('nav_war', async (ctx) => { await ctx.answerCbQuery().catch(() => {}); return showWarMenu(ctx); });
bot.action('war_help', async (ctx) => { await ctx.answerCbQuery().catch(() => {}); return sendWarMessage(ctx.chat.id, trc({ title: 'How To Start A War', emoji: '⚔️', sections: [{ title: 'Command', emoji: '⌨️', content: '<code>/war @username</code>' }, { title: 'Rules', emoji: '📜', items: [tiny('Both players must have started the bot.'), tiny('The target receives Accept / Decline.'), tiny('Accepted war = best-of-5 RPS.'), tiny('First to 3 round wins becomes the winner.')] }], footer: tiny('Keep it fun. No real-world threats or harassment.') }), Markup.inlineKeyboard([[styledCallback('⬅ Back', 'nav_war')]])); });

bot.action(/^war_(accept|decline):(\d+)$/, async (ctx) => {
  const action = ctx.match[1]; const id = Number(ctx.match[2]);
  const result = action === 'accept' ? db.acceptWar(id, ctx.from.id) : db.declineWar(id, ctx.from.id);
  if (!result.ok) return ctx.answerCbQuery(tiny('This war is no longer available.'), { show_alert: true }).catch(() => {});
  const war = result.war;
  const challenger = db.getUser(war.challenger_id); const opponent = db.getUser(war.opponent_id);
  if (action === 'decline') {
    const msg = trc({ title: 'WAR DECLINED', emoji: '❌', intro: `${userDisplay(opponent)} ${tiny('declined the war from')} ${userDisplay(challenger)}.` });
    await sendWarMessage(war.challenger_id, msg); await ctx.editMessageCaption?.(msg, { parse_mode: 'HTML' }).catch(() => {}); await ctx.answerCbQuery(tiny('War declined.')); return;
  }
  const lobby = trc({ title: 'WAR ACCEPTED!', emoji: '⚔️', intro: `${userDisplay(challenger)} ${tiny('VS')} ${userDisplay(opponent)}`, sections: [{ title: 'Score', emoji: '🏆', content: '<b>0 - 0</b>' }, { title: 'Round 1', emoji: '🎮', content: tiny('Choose your move below. Your opponent will not see it until both players choose.') }], footer: tiny('First to 3 wins the war.') });
  await sendWarMessage(war.challenger_id, lobby, warChoiceButtons(war.id));
  await sendWarMessage(war.opponent_id, lobby, warChoiceButtons(war.id));
  await ctx.answerCbQuery(tiny('War accepted! Enter the arena.'));
});

const beats = { rock: 'scissors', scissors: 'paper', paper: 'rock' };
bot.action(/^war_move:(\d+):(rock|paper|scissors)$/, async (ctx) => {
  const warId = Number(ctx.match[1]); const choice = ctx.match[2];
  const war = db.getWar(warId);
  if (!war || war.status !== 'active' || ![war.challenger_id, war.opponent_id].includes(ctx.from.id)) return ctx.answerCbQuery(tiny('This war is not active.'), { show_alert: true }).catch(() => {});
  const result = db.saveWarMove(warId, war.round, ctx.from.id, choice);
  if (!result.ok) return ctx.answerCbQuery(tiny('Move could not be saved.'), { show_alert: true }).catch(() => {});
  if (!result.ready) return ctx.answerCbQuery(tiny('Move locked. Waiting for your opponent...')); 
  const a = result.moves.find(m => m.user_id === war.challenger_id); const b = result.moves.find(m => m.user_id === war.opponent_id);
  const winner = a.choice === b.choice ? 0 : (beats[a.choice] === b.choice ? war.challenger_id : war.opponent_id);
  const roundResult = winner ? db.recordWarRound(warId, winner, true) : db.recordWarRound(warId, ctx.from.id, false);
  const updated = roundResult.war;
  const names = { [war.challenger_id]: userDisplay(db.getUser(war.challenger_id)), [war.opponent_id]: userDisplay(db.getUser(war.opponent_id)) };
  let text;
  if (roundResult.finished) {
    text = trc({ title: 'WAR OVER!', emoji: '🏆', intro: `${names[updated.winner_id]} ${tiny('wins the war!')}`, sections: [{ title: 'Final Score', emoji: '⚔️', content: `<b>${updated.challenger_score} - ${updated.opponent_score}</b>` }, { title: 'Prize', emoji: '🎁', content: tiny('Winner receives +25 points.') }], footer: tiny('The arena is open for another challenge.') });
    // War winner prize: +25 points and +50 XP.
    db.db.prepare('UPDATE users SET points = points + 25 WHERE user_id = ?').run(updated.winner_id);
    db.db.prepare('INSERT INTO point_transactions (user_id, amount, reason, reference) VALUES (?, ?, ?, ?)').run(updated.winner_id, 25, 'war_prize', String(warId));
    db.addXpTxn?.(updated.winner_id, 50, 'war_win');
  } else {
    text = trc({ title: `ROUND ${war.round} COMPLETE`, emoji: '⚔️', intro: winner ? `${names[winner]} ${tiny('wins the round!')}` : tiny('Round draw!'), sections: [{ title: 'Moves', emoji: '🎮', content: `<code>${a.choice.toUpperCase()}</code> vs <code>${b.choice.toUpperCase()}</code>` }, { title: 'Score', emoji: '🏆', content: `<b>${updated.challenger_score} - ${updated.opponent_score}</b>` }, { title: `Round ${updated.round}`, emoji: '🔥', content: tiny('Choose your next move.') }] });
  }
  await sendWarMessage(updated.challenger_id, text, roundResult.finished ? Markup.inlineKeyboard([[styledCallback('⚔️ War Arena', 'nav_war')]]) : warChoiceButtons(warId));
  await sendWarMessage(updated.opponent_id, text, roundResult.finished ? Markup.inlineKeyboard([[styledCallback('⚔️ War Arena', 'nav_war')]]) : warChoiceButtons(warId));
  await ctx.answerCbQuery(tiny('Round resolved!'));
});

// ============================================================
// GAMES MENU
// ============================================================

const GAME_LABELS = {
  battle_royale: '🔥 ʙᴀᴛᴛʟᴇ ʀᴏʏᴀʟᴇ',
  team_deathmatch: '⚔️ ᴛᴇᴀᴍ ᴅᴇᴀᴛʜᴍᴀᴛᴄʜ',
  sniper_duel: '🎯 sɴɪᴘᴇʀ ᴅᴜᴇʟ',
  search_destroy: '💣 sᴇᴀʀᴄʜ & ᴅᴇsᴛʀᴏʏ',
  bomb_arena: '💣 ʙᴏᴍʙ ᴀʀᴇɴᴀ',
  gun_game: '🔫 ɢᴜɴ ɢᴀᴍᴇ',
  tictactoe: '⭕ ᴛɪᴄ-ᴛᴀᴄ-ᴛᴏᴇ',
  rps: '✊ ʀᴏᴄᴋ ᴘᴀᴘᴇʀ sᴄɪssᴏʀs',
  chess: '♟ ᴄʜᴇss ᴘᴜᴢᴢʟᴇ',
  quiz: '🖼 ғʟᴀɢ ǫᴜɪᴢ',
  scramble: '🔤 ᴡᴏʀᴅ sᴄʀᴀᴍʙʟᴇ',
  memory: '🧠 ᴍᴇᴍᴏʀʏ ᴍᴀᴛᴄʜ',
};
const GAME_COUNT = Object.keys(GAME_LABELS).length;

// A game can also be configured as a paid task. The normal game point is still
// awarded once, and each matching game task can award its configured bonus
// points exactly once when the user wins the game.
async function completeGameTasks(ctx, gameType) {
  const tasks = db.listGameTasks(gameType);
  const rewards = [];
  for (const task of tasks) {
    const result = db.completeTaskTxn(
      ctx.from.id,
      ctx.from.username || ctx.from.first_name,
      task.id
    );
    if (result.ok && !result.alreadyCompleted && result.rewardPoints > 0) {
      rewards.push({ label: task.label, points: result.rewardPoints });
    }
  }
  return rewards;
}

function rewardLine(rewards) {
  const taskRewards = Array.isArray(rewards) ? rewards : [];
  const gameResult = rewards?.gameResult;
  const base = gamificationRewardLine(gameResult || { taskRewards });
  return base;
}

bot.action('nav_games', async (ctx) => {
  const done = new Set(db.listGameCompletions(ctx.from.id));
  const rows = Object.entries(GAME_LABELS).map(([key, label]) => [
    styledCallback(`${done.has(key) ? '✅' : '🎮'} ${label}`, `game_start:${key}`),
  ]);
  rows.push([styledCallback('⚔️ ᴡᴀʀ / ᴘᴠᴘ', 'nav_war')]);
  rows.push([styledCallback('⬅️ ʙᴀᴄᴋ', 'nav_home')]);
  const text = trc({
    title: 'ʀᴜsʜ ɢᴀᴍᴇs', emoji: '🎮',
    intro: tiny('Choose a mode. Shooter modes use tactical actions, health, weapons and rounds.'),
    sections: [{ title: '🔥 Shooter Arena', emoji: '🔫', items: [tiny('Battle Royale — survive the zone.'), tiny('Team Deathmatch — race for kills.'), tiny('Sniper Duel — win the best of 5.'), tiny('Search & Destroy — attack or defend.'), tiny('Gun Game — upgrade weapons after every kill.')] }, { title: '🎮 Classic Arcade', emoji: '🕹️', items: [tiny('Tic-Tac-Toe, RPS, Chess, Quiz, Scramble and Memory.')] }],
    footer: tiny(`${done.size}/${GAME_COUNT} games completed. First wins earn points.`),
  });
  const opts = { parse_mode: 'HTML', ...Markup.inlineKeyboard(rows) };
  const image = process.env.GAMES_MENU_IMAGE_URL || process.env.MENU_IMAGE_URL;
  if (ctx.callbackQuery) {
    try { await ctx.editMessageCaption(text, opts); await ctx.answerCbQuery(); return; } catch (_) {}
    try { await ctx.editMessageText(text, opts); await ctx.answerCbQuery(); return; } catch (_) {}
  }
  if (image) return ctx.replyWithPhoto(image, { caption: text, ...opts });
  return ctx.reply(text, opts);
});

bot.action(/^game_start:(.+)$/, async (ctx) => {
  const game = ctx.match[1];
  await ctx.answerCbQuery().catch(() => {});
  if (game === 'tictactoe') return startTicTacToe(ctx);
  if (game === 'rps') return startRps(ctx);
  if (game === 'chess') return startChessPuzzle(ctx);
  if (game === 'quiz') return startQuiz(ctx);
  if (game === 'scramble') return startScramble(ctx);
  if (game === 'memory') return startMemory(ctx);
  if (game === 'battle_royale') return startBattleRoyale(ctx);
  if (game === 'team_deathmatch') return startTeamDeathmatch(ctx);
  if (game === 'sniper_duel') return startSniperDuel(ctx);
  if (game === 'search_destroy') return startSearchDestroy(ctx);
  if (game === 'gun_game') return startGunGame(ctx);
  if (game === 'bomb_arena') return startBombArena(ctx);
});

const backToGamesKb = () => Markup.inlineKeyboard([[styledCallback('⬅ Back to Games', 'nav_games')]]);

// ============================================================
// MULTIPLAYER BOMB ARENA
// ============================================================
const bombRooms = new Map();
const premiumIds = new Set(String(process.env.PREMIUM_USER_IDS || '').split(',').map(x => x.trim()).filter(Boolean));

// ============================================================
// GAME WIN CHANNEL CLAIMS
// Every game winner can trigger a public channel winner post with
// winner-only CLAIM and LEAVE buttons. Non-winners get a private
// "not for u" alert when they try to claim.
// ============================================================
const gameWinClaims = new Map();
const GAME_WIN_CHANNEL_ID = process.env.GAME_WIN_CHANNEL_ID || process.env.TELEGRAM_CHAT_ID || '';
const GAME_WIN_CLAIM_POINTS = Math.max(1, Number(process.env.GAME_WIN_CLAIM_POINTS || 25));
function gameWinToken() { return Math.random().toString(36).slice(2, 10).toUpperCase(); }
function gameWinChannelKeyboard(token) {
  return Markup.inlineKeyboard([[
    styledCallback('🎁 ᴄʟᴀɪᴍ', `gamewin:claim:${token}`),
    styledCallback('🚪 ʟᴇᴀᴠᴇ', `gamewin:leave:${token}`),
  ]]);
}
function gameWinChannelText({ winnerName, gameType, prize, claimed = false, left = false }) {
  const status = claimed ? '✅ ᴄʟᴀɪᴍᴇᴅ' : left ? '🚪 ʟᴇғᴛ' : '🎁 ʀᴇᴀᴅʏ ᴛᴏ ᴄʟᴀɪᴍ';
  return `╭━━━〔 🏆 ɢᴀᴍᴇ ᴡɪɴɴᴇʀ 〕━━━╮\n┃\n┃ 👑 ᴡɪɴɴᴇʀ: <b>${escapeHtml(winnerName)}</b>\n┃ 🎮 ɢᴀᴍᴇ: <b>${escapeHtml(gameType.replace(/_/g, ' '))}</b>\n┃ 💰 ʀᴇᴡᴀʀᴅ: <b>+${prize} ᴘᴏɪɴᴛs</b>\n┃ 📌 sᴛᴀᴛᴜs: <b>${status}</b>\n┃\n┃ 🎁 ᴡɪɴɴᴇʀ ᴍᴜsᴛ ᴄʟᴀɪᴍ ᴛʜᴇ ʀᴇᴡᴀʀᴅ.\n╰━━━━━━━━━━━━━━━━━━━━━━╯`;
}
async function postGameWinToChannel(winnerId, winnerName, gameType) {
  if (!GAME_WIN_CHANNEL_ID) return null;
  const token = gameWinToken();
  const claim = { token, winnerId: String(winnerId), winnerName, gameType, prize: GAME_WIN_CLAIM_POINTS, claimed: false, left: false, chatId: null, messageId: null };
  gameWinClaims.set(token, claim);
  try {
    const msg = await bot.telegram.sendMessage(
      GAME_WIN_CHANNEL_ID,
      gameWinChannelText(claim),
      { parse_mode: 'HTML', ...gameWinChannelKeyboard(token) }
    );
    claim.chatId = msg.chat.id;
    claim.messageId = msg.message_id;
    return claim;
  } catch (err) {
    gameWinClaims.delete(token);
    console.error('Could not post game winner to channel:', err.message);
    return null;
  }
}

bot.action(/^gamewin:(claim|leave):([A-Z0-9]+)$/, async ctx => {
  const action = ctx.match[1];
  const token = ctx.match[2];
  const claim = gameWinClaims.get(token);
  if (!claim) return ctx.answerCbQuery(tiny('ᴛʜɪs ᴡɪɴɴᴇʀ ᴘᴏsᴛ ɪs ɴᴏ ʟᴏɴɢᴇʀ ᴀᴠᴀɪʟᴀʙʟᴇ.'), { show_alert: true }).catch(() => {});

  if (String(ctx.from.id) !== claim.winnerId) {
    return ctx.answerCbQuery(tiny('ɴᴏᴛ ғᴏʀ ᴜ! ᴛʜɪs ʀᴇᴡᴀʀᴅ ʙᴇʟᴏɴɢs ᴛᴏ ᴛʜᴇ ᴡɪɴɴᴇʀ.'), { show_alert: true }).catch(() => {});
  }
  if (claim.claimed) return ctx.answerCbQuery(tiny('ʀᴇᴡᴀʀᴅ ᴀʟʀᴇᴀᴅʏ ᴄʟᴀɪᴍᴇᴅ.'), { show_alert: true }).catch(() => {});
  if (claim.left) return ctx.answerCbQuery(tiny('ʏᴏᴜ ʟᴇғᴛ ᴛʜɪs ʀᴇᴡᴀʀᴅ.'), { show_alert: true }).catch(() => {});

  if (action === 'claim') {
    claim.claimed = true;
    db.db.prepare('UPDATE users SET points = points + ? WHERE user_id = ?').run(claim.prize, ctx.from.id);
    db.db.prepare('INSERT INTO point_transactions (user_id, amount, reason, reference) VALUES (?, ?, ?, ?)').run(ctx.from.id, claim.prize, 'game_win_claim', `${claim.gameType}:${claim.token}`);
    await ctx.answerCbQuery(tiny(`🎉 ᴄʟᴀɪᴍᴇᴅ +${claim.prize} ᴘᴏɪɴᴛs!`), { show_alert: true }).catch(() => {});
  } else {
    claim.left = true;
    await ctx.answerCbQuery(tiny('🚪 ʀᴇᴡᴀʀᴅ ʟᴇғᴛ.'), { show_alert: true }).catch(() => {});
  }

  try {
    await ctx.editMessageText(gameWinChannelText(claim), { parse_mode: 'HTML' });
  } catch (_) {}
  gameWinClaims.delete(token);
});
function isBombPremium(userId) { return premiumIds.has(String(userId)); }
function bombName(ctx) { return (ctx.from.username || ctx.from.first_name || `player${ctx.from.id}`).replace(/[^a-zA-Z0-9_]/g, ''); }
function bombRoomCode() { return Math.random().toString(36).slice(2,8).toUpperCase(); }

async function startBombArena(ctx) {
  const code=bombRoomCode();
  const room=bombArena.createRoom(ctx.from.id,bombName(ctx),isBombPremium(ctx.from.id));
  room.code=code;
  bombRooms.set(code,room);
  const text=bombArena.lobbyText(room)+`\n\n🔑 ʀᴏᴏᴍ ᴄᴏᴅᴇ: <code>${code}</code>`;
  await ctx.editMessageText(text,{parse_mode:'HTML',...bombArena.lobbyKeyboard(code,room.creatorId)}).catch(()=>ctx.reply(text,{parse_mode:'HTML',...bombArena.lobbyKeyboard(code,room.creatorId)}));
}

bot.action(/^bomb:(join|players|start|settings|leave):([A-Z0-9]+)$/, async ctx => {
  const action=ctx.match[1], code=ctx.match[2], room=bombRooms.get(code);
  if(!room) return ctx.answerCbQuery(tiny('ʀᴏᴏᴍ ɴᴏ ʟᴏɴɢᴇʀ ᴇxɪsᴛs.'),{show_alert:true});
  const name=bombName(ctx); let p=room.players.find(x=>x.id===ctx.from.id);
  if(action==='join') {
    if(p) return ctx.answerCbQuery(tiny('ʏᴏᴜ ᴀʀᴇ ᴀʟʀᴇᴀᴅʏ ɪɴ ᴛʜᴇ ʀᴏᴏᴍ.'));
    if(room.started) return ctx.answerCbQuery(tiny('ᴛʜᴇ ɢᴀᴍᴇ ʜᴀs ᴀʟʀᴇᴀᴅʏ sᴛᴀʀᴛᴇᴅ.'),{show_alert:true});
    if(room.players.length>=room.maxPlayers) return ctx.answerCbQuery(tiny('ʀᴏᴏᴍ ɪs ғᴜʟʟ.'),{show_alert:true});
    room.players.push({id:ctx.from.id,name,lives:2,score:0,eliminated:false});
  }
  if(action==='players') return ctx.answerCbQuery(room.players.map(x=>`👤 ${x.name}`).join('\n') || tiny('ɴᴏ ᴘʟᴀʏᴇʀs'),{show_alert:true});
  if(action==='settings') return ctx.answerCbQuery(tiny(`ᴇʟɪᴍɪɴᴀᴛɪᴏɴ • ${room.maxRounds} ʀᴏᴜɴᴅs • ${room.maxPlayers} ᴘʟᴀʏᴇʀs`),{show_alert:true});
  if(action==='leave') { room.players=room.players.filter(x=>x.id!==ctx.from.id); if(!room.players.length){bombRooms.delete(code);return ctx.editMessageText(tiny('💣 ʀᴏᴏᴍ ᴄʟᴏsᴇᴅ.'),{parse_mode:'HTML',...backToGamesKb()});} if(room.creatorId===ctx.from.id) room.creatorId=room.players[0].id; }
  if(action==='start') {
    if(ctx.from.id!==room.creatorId) return ctx.answerCbQuery(tiny('ᴏɴʟʏ ᴛʜᴇ ᴄʀᴇᴀᴛᴏʀ ᴄᴀɴ sᴛᴀʀᴛ.'),{show_alert:true});
    if(room.players.length<2) return ctx.answerCbQuery(tiny('ɴᴇᴇᴅ ᴀᴛ ʟᴇᴀsᴛ 2 ᴘʟᴀʏᴇʀs.'),{show_alert:true});
    room.started=true; room.round=1; room.turnIndex=0; bombArena.resetRound(room);
    return ctx.editMessageText(bombArena.gameText(room,room.premium?'💎 ᴘʀᴇᴍɪᴜᴍ ᴇғғᴇᴄᴛs ᴇɴᴀʙʟᴇᴅ':'💣 ɢᴀᴍᴇ sᴛᴀʀᴛᴇᴅ!'),{parse_mode:'HTML',...bombArena.gameKeyboard(room)});
  }
  const text=bombArena.lobbyText(room)+`\n\n🔑 ʀᴏᴏᴍ ᴄᴏᴅᴇ: <code>${code}</code>`;
  await ctx.answerCbQuery(tiny(action==='join'?'ᴊᴏɪɴᴇᴅ!':'')).catch(()=>{});
  return ctx.editMessageText(text,{parse_mode:'HTML',...bombArena.lobbyKeyboard(code,room.creatorId)});
});

bot.action(/^bomb:tile:(\d+)$/, async ctx => {
  const code=[...bombRooms.entries()].find(([,r])=>r.started && r.players.some(p=>p.id===ctx.from.id))?.[0];
  const room=code?bombRooms.get(code):null;
  if(!room) return ctx.answerCbQuery(tiny('sᴛᴀʀᴛ ᴏʀ ᴊᴏɪɴ ᴀ ʙᴏᴍʙ ᴀʀᴇɴᴀ ғɪʀsᴛ.'),{show_alert:true});
  const p=room.players.find(x=>x.id===ctx.from.id), current=bombArena.currentPlayer(room), idx=Number(ctx.match[1]);
  if(!current || current.id!==ctx.from.id) return ctx.answerCbQuery(tiny(`ɪᴛ's ${current?.name || 'ᴀɴᴏᴛʜᴇʀ ᴘʟᴀʏᴇʀ'}'s ᴛᴜʀɴ.`));
  if(!room.awaiting) return ctx.answerCbQuery(tiny('ᴡᴀɪᴛ ғᴏʀ ᴛʜᴇ ɴᴇxᴛ ʀᴏᴜɴᴅ.'));
  room.awaiting=false;
  if(room.bombs.includes(idx)) {
    p.lives--; room.streak=0;
    if(p.lives<=0) p.eliminated=true;
    let notice=room.premium?'💣 🔥 3... 2... 1... 💥💥💥 ʙᴏᴏᴍ!':'💥💥💥 ʙᴏᴏᴍ!';
    await ctx.answerCbQuery(tiny('💥 ʙᴏᴏᴍ!'),{show_alert:false});
    if(room.premium){ await ctx.editMessageText(`💣 <b>ᴡᴀʀɴɪɴɢ...</b>\n\n🔥 3...\n🔥 2...\n🔥 1...\n\n💥💥💥 <b>ʙᴏᴏᴍ!</b> 💥💥💥`,{parse_mode:'HTML'}).catch(()=>{}); await new Promise(r=>setTimeout(r,700)); }
    notice += `\n☠️ ${p.name} ${p.eliminated?'ᴡᴀs ᴇʟɪᴍɪɴᴀᴛᴇᴅ':'ʟᴏsᴛ ᴀ ʟɪғᴇ'}.`;
    const alive=bombArena.activePlayers(room);
    if(alive.length<=1 || room.round>=room.maxRounds) { const winner=alive[0]||room.players.sort((a,b)=>b.score-a.score)[0]; room.finished=true; if(winner){ const winnerCtx={from:{id:winner.id,username:winner.name,first_name:winner.name}}; await processGameWin(winnerCtx,'bomb_arena'); } return ctx.editMessageText(`🏆 <b>ɢᴀᴍᴇ ᴏᴠᴇʀ!</b>\n\n🥇 ${winner?.name||'—'}\n💰 <b>+${room.prize.toLocaleString()} ᴄᴏɪɴs</b>\n🔥 sᴛʀᴇᴀᴋ: ${room.streak}\n\n📢 ᴡɪɴɴᴇʀ ʀᴇᴡᴀʀᴅ ᴘᴏsᴛᴇᴅ ᴛᴏ ᴛʜᴇ ᴄʜᴀɴɴᴇʟ.`,{parse_mode:'HTML',...backToGamesKb()}); }
  } else { p.score+=100; room.streak++; }
  bombArena.nextTurn(room); room.round++; bombArena.resetRound(room);
  return ctx.editMessageText(bombArena.gameText(room,room.premium?'💎 ᴘʀᴇᴍɪᴜᴍ ᴇғғᴇᴄᴛ: ᴏɴ':'✅ sᴀғᴇ! +100 ᴘᴏɪɴᴛs'),{parse_mode:'HTML',...bombArena.gameKeyboard(room)});
});

bot.action(/^bomb:power:(shield|scan)$/, async ctx => {
  const code=[...bombRooms.entries()].find(([,r])=>r.started && r.players.some(p=>p.id===ctx.from.id))?.[0];
  const room=code?bombRooms.get(code):null; if(!room)return ctx.answerCbQuery(tiny('ɴᴏ ᴀᴄᴛɪᴠᴇ ɢᴀᴍᴇ.'),{show_alert:true});
  if(!isBombPremium(ctx.from.id)) return ctx.answerCbQuery(tiny('💎 ᴛʜɪs ᴘᴏᴡᴇʀ-ᴜᴘ ɪs ᴘʀᴇᴍɪᴜᴍ.'),{show_alert:true});
  if(ctx.match[1]==='scan') return ctx.answerCbQuery(tiny(`🔍 sᴀғᴇ ᴛɪʟᴇ: ${room.tiles.findIndex(x=>x!=='💣')+1}`),{show_alert:true});
  return ctx.answerCbQuery(tiny('🛡️ sʜɪᴇʟᴅ ᴀᴄᴛɪᴠᴀᴛᴇᴅ!'),{show_alert:true});
});


function shooterMenu(text, keyboard) {
  return { parse_mode: 'HTML', ...keyboard };
}
async function startBattleRoyale(ctx) {
  const st = shooterGames.battleRoyaleState(); const session = db.createSession(ctx.from.id, 'battle_royale', st);
  const text = shooterGames.battleRoyaleText(st); const kb = shooterGames.battleRoyaleKeyboard(st);
  await ctx.editMessageText(text, shooterMenu(text, kb)).catch(() => ctx.reply(text, shooterMenu(text, kb)));
}
bot.action(/^br:(fire|move|heal|cover|loot|exit)$/, async (ctx) => {
  const session = db.db.prepare("SELECT * FROM game_sessions WHERE user_id = ? AND game_type = 'battle_royale' AND status = 'active' ORDER BY id DESC LIMIT 1").get(ctx.from.id);
  if (!session) return ctx.answerCbQuery(tiny('Start a new Battle Royale from Games.'), { show_alert: true });
  const s = db.getSession(session.id); const action = ctx.match[1];
  if (action === 'exit') { db.updateSession(s.id, s.state, 'finished'); return ctx.editMessageText(tiny('🏁 Battle Royale ended.'), { parse_mode: 'HTML', ...backToGamesKb() }); }
  const st = s.state;
  if (action === 'fire' && st.ammo > 0) { st.ammo--; if (Math.random() < 0.68) { st.kills++; st.enemies--; } else st.hp -= Math.floor(Math.random()*16); }
  if (action === 'move') { st.zone++; st.hp -= Math.max(0, 8 - st.armor/20); if (Math.random() < 0.45 && st.enemies > 0) st.enemies--; }
  if (action === 'heal' && st.medkits > 0) { st.medkits--; st.hp = Math.min(100, st.hp + 30); }
  if (action === 'cover') { st.armor = Math.min(100, st.armor + 12); }
  if (action === 'loot') { st.ammo += 12; st.armor = Math.min(100, st.armor + 10); if (Math.random() < .35) st.medkits++; }
  if (st.enemies <= 0 || st.hp <= 0) {
    db.updateSession(s.id, st, 'finished');
    const win = st.hp > 0;
    if (win) await processGameWin(ctx, 'battle_royale');
    const text = win ? `👑 <b>ʙᴀᴛᴛʟᴇ ʀᴏʏᴀʟᴇ ᴡɪɴ!</b>\n\n💀 ᴋɪʟʟs: <b>${st.kills}</b>\n🎁 ʀᴇᴡᴀʀᴅ ᴜɴʟᴏᴄᴋᴇᴅ.` : `💀 <b>ʏᴏᴜ ᴡᴇʀᴇ ᴇʟɪᴍɪɴᴀᴛᴇᴅ.</b>\n\n💀 ᴋɪʟʟs: <b>${st.kills}</b>`;
    return ctx.editMessageText(text, { parse_mode: 'HTML', ...backToGamesKb() });
  }
  db.updateSession(s.id, st, 'active'); await ctx.answerCbQuery(tiny('Action complete!')); return ctx.editMessageText(shooterGames.battleRoyaleText(st), shooterMenu('', shooterGames.battleRoyaleKeyboard(st)));
});

async function startGunGame(ctx) { const st=shooterGames.gunGameState(); const ss=db.createSession(ctx.from.id,'gun_game',st); const text=shooterGames.gunGameText(st); await ctx.editMessageText(text,{parse_mode:'HTML',...shooterGames.gunGameKeyboard()}).catch(()=>ctx.reply(text,{parse_mode:'HTML',...shooterGames.gunGameKeyboard()})); }
bot.action(/^gg:(fire|reload)$/, async ctx=>{ const row=db.db.prepare("SELECT * FROM game_sessions WHERE user_id=? AND game_type='gun_game' AND status='active' ORDER BY id DESC LIMIT 1").get(ctx.from.id); if(!row)return ctx.answerCbQuery(tiny('Start Gun Game first.'),{show_alert:true}); const ss=db.getSession(row.id),s=ss.state,a=ctx.match[1]; if(a==='reload')s.ammo=8; else { if(s.ammo<=0)return ctx.answerCbQuery(tiny('Reload first!')); s.ammo--; if(Math.random()<.72){s.kills++;s.index=Math.min(WEAPON_MAX_INDEX,s.index+1);} else s.hp-=Math.floor(Math.random()*20); } if(s.kills>=s.target){db.updateSession(ss.id,s,'finished');await processGameWin(ctx,'gun_game');return ctx.editMessageText(`👑 <b>ɢᴜɴ ɢᴀᴍᴇ ᴄʟᴇᴀʀᴇᴅ!</b>\n\n🔥 ${s.kills} ᴋɪʟʟs`,{parse_mode:'HTML',...backToGamesKb()});} if(s.hp<=0){db.updateSession(ss.id,s,'finished');return ctx.editMessageText(tiny('💀 You were eliminated.'),{parse_mode:'HTML',...backToGamesKb()});} db.updateSession(ss.id,s,'active'); await ctx.answerCbQuery(); return ctx.editMessageText(shooterGames.gunGameText(s),{parse_mode:'HTML',...shooterGames.gunGameKeyboard()}); });
const WEAPON_MAX_INDEX = 4;
async function startSniperDuel(ctx){const st=shooterGames.sniperState();db.createSession(ctx.from.id,'sniper_duel',st);const text=shooterGames.sniperText(st);await ctx.editMessageText(text,{parse_mode:'HTML',...shooterGames.sniperKeyboard()}).catch(()=>ctx.reply(text,{parse_mode:'HTML',...shooterGames.sniperKeyboard()}));}
bot.action(/^sniper:(head|body|move)$/,async ctx=>{const row=db.db.prepare("SELECT * FROM game_sessions WHERE user_id=? AND game_type='sniper_duel' AND status='active' ORDER BY id DESC LIMIT 1").get(ctx.from.id);if(!row)return ctx.answerCbQuery(tiny('Start Sniper Duel first.'),{show_alert:true});const ss=db.getSession(row.id),s=ss.state,win=Math.random()<({head:.65,body:.52,move:.45}[ctx.match[1]]);if(win)s.wins++;else s.enemyWins++;s.round++;if(s.wins>=3||s.enemyWins>=3){db.updateSession(ss.id,s,'finished');if(s.wins>=3)await processGameWin(ctx,'sniper_duel');return ctx.editMessageText(`🎯 <b>sɴɪᴘᴇʀ ᴅᴜᴇʟ ᴏᴠᴇʀ!</b>\n\n👤 ${s.wins} — 🤖 ${s.enemyWins}`,{parse_mode:'HTML',...backToGamesKb()});}db.updateSession(ss.id,s,'active');await ctx.answerCbQuery(win?tiny('Headshot!'):tiny('Enemy got the shot!'));return ctx.editMessageText(shooterGames.sniperText(s),{parse_mode:'HTML',...shooterGames.sniperKeyboard()});});
async function startSearchDestroy(ctx){const st=shooterGames.searchDestroyState();db.createSession(ctx.from.id,'search_destroy',st);const text=shooterGames.sdText(st);await ctx.editMessageText(text,{parse_mode:'HTML',...shooterGames.sdKeyboard()}).catch(()=>ctx.reply(text,{parse_mode:'HTML',...shooterGames.sdKeyboard()}));}
bot.action(/^sd:(plant|rush|hold)$/,async ctx=>{const row=db.db.prepare("SELECT * FROM game_sessions WHERE user_id=? AND game_type='search_destroy' AND status='active' ORDER BY id DESC LIMIT 1").get(ctx.from.id);if(!row)return ctx.answerCbQuery(tiny('Start Search & Destroy first.'),{show_alert:true});const ss=db.getSession(row.id),s=ss.state,a=ctx.match[1];if(a==='plant')s.planted=true;const win=Math.random()<({plant:.72,rush:.58,hold:.5}[a]);if(win)s.wins++;else s.enemyWins++;s.planted=false;s.round++;if(s.wins>=3||s.enemyWins>=3){db.updateSession(ss.id,s,'finished');if(s.wins>=3)await processGameWin(ctx,'search_destroy');return ctx.editMessageText(`🏆 <b>sᴇᴀʀᴄʜ & ᴅᴇsᴛʀᴏʏ ᴏᴠᴇʀ!</b>\n\n🔴 ${s.wins} — 🔵 ${s.enemyWins}`,{parse_mode:'HTML',...backToGamesKb()});}db.updateSession(ss.id,s,'active');await ctx.answerCbQuery(win?tiny('Round won!'):tiny('Round lost!'));return ctx.editMessageText(shooterGames.sdText(s),{parse_mode:'HTML',...shooterGames.sdKeyboard()});});

bot.action('noop', (ctx) => ctx.answerCbQuery());

// ---- Tic-Tac-Toe ----
async function startTicTacToe(ctx) {
  const session = db.createSession(ctx.from.id, 'tictactoe', Array(9).fill(null));
  await ctx.editMessageText(ttt.statusText(null), { parse_mode: 'HTML', ...ttt.renderKeyboard(session.id, session.state) }).catch(() =>
    ctx.reply(ttt.statusText(null), { parse_mode: 'HTML', ...ttt.renderKeyboard(session.id, session.state) })
  );
}
bot.action(/^ttt:(\d+):(\d+)$/, async (ctx) => {
  const sessionId = Number(ctx.match[1]);
  const cell = Number(ctx.match[2]);
  const session = db.getSession(sessionId);
  if (!session || session.status !== 'active' || session.user_id !== ctx.from.id) {
    return ctx.answerCbQuery('This game has ended — start a new one from the Games menu.').catch(() => {});
  }
  const board = session.state;
  if (board[cell]) return ctx.answerCbQuery('Already taken!').catch(() => {});
  board[cell] = 'X';
  let winner = ttt.checkWinner(board);
  if (!winner) {
    const move = ttt.botMove(board);
    if (move !== undefined && move !== null) board[move] = 'O';
    winner = ttt.checkWinner(board);
  }
  await ctx.answerCbQuery().catch(() => {});
  if (winner) {
    db.updateSession(sessionId, board, 'finished');
    let rewards = [];
    if (winner === 'X') {
      const gameResult = await processGameWin(ctx, 'tictactoe');
      rewards = gameResult.taskRewards;
      rewards.gameResult = gameResult;
    }
    await ctx.editMessageText(ttt.statusText(winner) + rewardLine(rewards), { parse_mode: 'HTML', ...backToGamesKb() }).catch(() => {});
  } else {
    db.updateSession(sessionId, board, 'active');
    await ctx.editMessageText(ttt.statusText(null), { parse_mode: 'HTML', ...ttt.renderKeyboard(sessionId, board) }).catch(() => {});
  }
});

// ---- Rock Paper Scissors ----
async function startRps(ctx) {
  await ctx.editMessageText('✊📄✂️ <b>Pick your move:</b>', { parse_mode: 'HTML', ...rps.keyboard() }).catch(() => ctx.reply('✊📄✂️ <b>Pick your move:</b>', { parse_mode: 'HTML', ...rps.keyboard() }));
}
bot.action(/^rps:(rock|paper|scissors)$/, async (ctx) => {
  const userChoice = ctx.match[1];
  const { botChoice, result } = rps.play(userChoice);
  let rewards = [];
  if (result === 'win') {
    const gameResult = await processGameWin(ctx, 'rps');
    rewards = gameResult.taskRewards;
    rewards.gameResult = gameResult;
  }
  await ctx.answerCbQuery().catch(() => {});
  await ctx.editMessageText(rps.resultText(userChoice, botChoice, result) + rewardLine(rewards), { parse_mode: 'HTML', ...backToGamesKb() }).catch(() => {});
});

// ---- Chess Puzzle ----
async function startChessPuzzle(ctx) {
  const p = chessPuzzle.randomPuzzle();
  const text = `♟ <b>Chess Puzzle</b>\n<pre>${p.board}</pre>\n${escapeHtml(p.question)}`;
  await ctx.editMessageText(text, { parse_mode: 'HTML', ...chessPuzzle.keyboard(p.idx, p.options) }).catch(() =>
    ctx.reply(text, { parse_mode: 'HTML', ...chessPuzzle.keyboard(p.idx, p.options) })
  );
}
bot.action(/^puzzle:(\d+):(\d+)$/, async (ctx) => {
  const puzzleIdx = Number(ctx.match[1]);
  const optIdx = Number(ctx.match[2]);
  const puzzle = chessPuzzle.PUZZLES[puzzleIdx];
  const correct = optIdx === puzzle.correctIndex;
  let rewards = [];
  if (correct) {
    const gameResult = await processGameWin(ctx, 'chess');
    rewards = gameResult.taskRewards;
    rewards.gameResult = gameResult;
  }
  await ctx.answerCbQuery(correct ? '🎉 Correct!' : `❌ Not quite — it was ${puzzle.options[puzzle.correctIndex]}`, { show_alert: true }).catch(() => {});
  const text = correct
    ? `🎉 <b>Correct!</b> ${escapeHtml(puzzle.options[puzzle.correctIndex])} was the move. Point earned.${rewardLine(rewards)}`
    : `❌ Not quite. The winning move was <b>${escapeHtml(puzzle.options[puzzle.correctIndex])}</b>.`;
  await ctx.editMessageText(text, { parse_mode: 'HTML', ...backToGamesKb() }).catch(() => {});
});

// ---- Flag Quiz ----
async function startQuiz(ctx) {
  const q = pictureQuiz.randomQuestion();
  await ctx.deleteMessage().catch(() => {});
  await ctx.replyWithPhoto(q.imageUrl, { caption: '🖼 <b>Which country does this flag belong to?</b>', parse_mode: 'HTML', ...pictureQuiz.keyboard(q.idx, q.options) });
}
bot.action(/^quiz:(\d+):(\d+)$/, async (ctx) => {
  const quizIdx = Number(ctx.match[1]);
  const optIdx = Number(ctx.match[2]);
  const q = pictureQuiz.BANK[quizIdx];
  const correct = optIdx === q.correctIndex;
  let rewards = [];
  if (correct) {
    const gameResult = await processGameWin(ctx, 'quiz');
    rewards = gameResult.taskRewards;
    rewards.gameResult = gameResult;
  }
  await ctx.answerCbQuery(correct ? '🎉 Correct!' : `❌ It was ${q.name}`, { show_alert: true }).catch(() => {});
  const caption = correct ? `🎉 <b>Correct!</b> It's ${escapeHtml(q.name)} — point earned.${rewardLine(rewards)}` : `❌ <b>Nope.</b> That was the flag of ${escapeHtml(q.name)}.`;
  await ctx.editMessageCaption(caption, { parse_mode: 'HTML', ...backToGamesKb() }).catch(() => {});
});

// ---- Word Scramble ----
async function startScramble(ctx) {
  const q = wordScramble.randomQuestion();
  const text = `🔤 <b>Unscramble this word:</b>\n\n<code>${q.scrambled}</code>`;
  await ctx.editMessageText(text, { parse_mode: 'HTML', ...wordScramble.keyboard(q.idx, q.options) }).catch(() =>
    ctx.reply(text, { parse_mode: 'HTML', ...wordScramble.keyboard(q.idx, q.options) })
  );
}
bot.action(/^scramble:(\d+):(\d+)$/, async (ctx) => {
  const qIdx = Number(ctx.match[1]);
  const optIdx = Number(ctx.match[2]);
  const q = wordScramble.BANK[qIdx];
  const correct = optIdx === q.correctIndex;
  let rewards = [];
  if (correct) {
    const gameResult = await processGameWin(ctx, 'scramble');
    rewards = gameResult.taskRewards;
    rewards.gameResult = gameResult;
  }
  await ctx.answerCbQuery(correct ? '🎉 Correct!' : `❌ It was ${q.word}`, { show_alert: true }).catch(() => {});
  const text = correct ? `🎉 Correct — it was <b>${q.word}</b>! Point earned.${rewardLine(rewards)}` : `❌ Nope — the word was <b>${q.word}</b>.`;
  await ctx.editMessageText(text, { parse_mode: 'HTML', ...backToGamesKb() }).catch(() => {});
});

// ---- Memory Match ----
async function startMemory(ctx) {
  const state = memoryMatch.newBoard();
  const session = db.createSession(ctx.from.id, 'memory', state);
  await ctx.editMessageText(memoryMatch.statusText(state), { parse_mode: 'HTML', ...memoryMatch.renderKeyboard(session.id, state) }).catch(() =>
    ctx.reply(memoryMatch.statusText(state), { parse_mode: 'HTML', ...memoryMatch.renderKeyboard(session.id, state) })
  );
}
bot.action(/^memory:(\d+):(\d+)$/, async (ctx) => {
  const sessionId = Number(ctx.match[1]);
  const i = Number(ctx.match[2]);
  const session = db.getSession(sessionId);
  if (!session || session.status !== 'active' || session.user_id !== ctx.from.id) {
    return ctx.answerCbQuery('This game has ended — start a new one from the Games menu.').catch(() => {});
  }
  const state = session.state;
  if (state.matched[i] || state.firstPick === i) return ctx.answerCbQuery().catch(() => {});

  if (state.firstPick === null) {
    state.firstPick = i;
    await ctx.answerCbQuery().catch(() => {});
    db.updateSession(sessionId, state, 'active');
    await ctx.editMessageText(memoryMatch.statusText(state), { parse_mode: 'HTML', ...memoryMatch.renderKeyboard(sessionId, state) }).catch(() => {});
    return;
  }

  const first = state.firstPick;
  const isMatch = state.tiles[first] === state.tiles[i];
  if (isMatch) {
    state.matched[first] = true;
    state.matched[i] = true;
  }
  state.firstPick = null;
  await ctx.answerCbQuery(isMatch ? '✅ Match!' : `❌ No match: ${state.tiles[first]} vs ${state.tiles[i]}`, { show_alert: !isMatch }).catch(() => {});

  const allMatched = state.matched.every(Boolean);
  if (allMatched) {
    db.updateSession(sessionId, state, 'finished');
    const gameResult = await processGameWin(ctx, 'memory');
    const rewards = gameResult.taskRewards;
    rewards.gameResult = gameResult;
    await ctx.editMessageText(memoryMatch.statusText(state, '🎉 <b>All pairs matched!</b> Point earned.' + rewardLine(rewards)), { parse_mode: 'HTML', ...backToGamesKb() }).catch(() => {});
  } else {
    db.updateSession(sessionId, state, 'active');
    await ctx.editMessageText(memoryMatch.statusText(state), { parse_mode: 'HTML', ...memoryMatch.renderKeyboard(sessionId, state) }).catch(() => {});
  }
});

// ============================================================
// POINTS
// ============================================================
bot.action('nav_points', async (ctx) => {
  const user = db.getUser(ctx.from.id) || { points: 0 };
  const done = db.listGameCompletions(ctx.from.id);
  const rank = db.getUserRank(ctx.from.id);
  const text =
    `🏆 <b>Your Progress</b>\n\n` +
    `Points: <b>${user.points}</b> (rank #${rank})\n` +
    `Games completed: <b>${done.length}/${GAME_COUNT}</b>\n\n` +
    (done.length >= GAME_COUNT ? "You've completed every game — nice work! 🎉" : 'Keep going — finish them all for full marks.');
  await ctx.editMessageText(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[styledCallback('⬅ Back', 'nav_home')]]) }).catch(() => {});
  await ctx.answerCbQuery().catch(() => {});
});

// ============================================================
// TASKS
// ============================================================
function taskRowButtons(task, status) {
  const rows = [];
  if (task.type === 'game') {
    if (status === 'completed') rows.push([styledCallback('🏆 Completed', 'noop')]);
    else rows.push([styledCallback(`🎮 Play ${GAME_LABELS[task.game_type] || 'Game'}`, `game_start:${task.game_type}`)]);
  } else if (task.type === 'channel_join') {
    const link = task.link || (task.target_chat?.startsWith('@') ? `https://t.me/${task.target_chat.slice(1)}` : null);
    if (link) rows.push([styledUrl('🔗 Join Channel', link)]);
    if (status === 'completed') rows.push([styledCallback('✅ Done — Recheck', `task_recheck:${task.id}`)]);
    else if (status === 'blocked') rows.push([styledCallback('⚠️ Rejoined? Recheck', `task_recheck:${task.id}`)]);
    else rows.push([styledCallback("✅ I've Joined", `task_join:${task.id}`)]);
  } else if (task.type === 'whatsapp_join') {
    if (task.link) rows.push([styledUrl('🔗 Join WhatsApp Group', task.link)]);
    if (status === 'completed') rows.push([styledCallback('✅ Approved', 'noop')]);
    else if (status === 'awaiting_review') rows.push([styledCallback('⏳ Awaiting review...', 'noop')]);
    else rows.push([styledCallback('📸 Send Screenshot to Verify', `task_wa_start:${task.id}`)]);
  } else {
    if (task.link) rows.push([styledUrl('🔗 Open Link', task.link)]);
    rows.push([status === 'completed' ? styledCallback('✅ Done', 'noop') : styledCallback('✅ Mark Done', `task_manual_done:${task.id}`)]);
  }
  return rows;
}
function statusEmoji(status) {
  return { completed: '✅', awaiting_review: '⏳', blocked: '⚠️', pending: '▫️' }[status] || '▫️';
}
async function renderTasksMenu(ctx) {
  const tasks = db.listActiveTasks();
  const statuses = new Map(db.getUserTaskStatuses(ctx.from.id).map((r) => [r.task_id, r.status]));
  const lines = [`📋 <b>Tasks</b> (${tasks.filter((t) => statuses.get(t.id) === 'completed').length}/${tasks.length} complete)`, ''];
  const keyboard = [];
  for (const task of tasks) {
    const status = statuses.get(task.id) || 'pending';
    const prize = task.reward_points > 0 ? ` — 🎁 +${task.reward_points} pts` : '';
    lines.push(`${statusEmoji(status)} ${escapeHtml(task.label)}${prize}`);
    keyboard.push(...taskRowButtons(task, status));
  }
  keyboard.push([styledCallback('⬅ Back', 'nav_home')]);
  return { text: lines.join('\n'), markup: Markup.inlineKeyboard(keyboard) };
}
bot.action('nav_tasks', async (ctx) => {
  const { text, markup } = await renderTasksMenu(ctx);
  await ctx.editMessageText(text, { parse_mode: 'HTML', ...markup }).catch(() => ctx.reply(text, { parse_mode: 'HTML', ...markup }));
  await ctx.answerCbQuery().catch(() => {});
});
bot.action(/^task_join:(\d+)$/, async (ctx) => {
  const task = db.getTask(Number(ctx.match[1]));
  if (!task) return ctx.answerCbQuery('Task not found').catch(() => {});
  const isMember = await tasksLib.isTelegramMember(bot, task.target_chat, ctx.from.id);
  if (isMember) db.completeTaskTxn(ctx.from.id, ctx.from.username || ctx.from.first_name, task.id);
  else db.setUserTaskStatus(ctx.from.id, task.id, 'pending');
  await ctx.answerCbQuery(isMember ? '✅ Verified — thanks!' : "❌ Didn't find you in that channel yet — join then try again.", { show_alert: true }).catch(() => {});
  const { text, markup } = await renderTasksMenu(ctx);
  await ctx.editMessageText(text, { parse_mode: 'HTML', ...markup }).catch(() => {});
});
bot.action(/^task_recheck:(\d+)$/, async (ctx) => {
  const task = db.getTask(Number(ctx.match[1]));
  if (!task) return ctx.answerCbQuery('Task not found').catch(() => {});
  const isMember = await tasksLib.isTelegramMember(bot, task.target_chat, ctx.from.id);
  if (isMember) db.completeTaskTxn(ctx.from.id, ctx.from.username || ctx.from.first_name, task.id);
  else db.setUserTaskStatus(ctx.from.id, task.id, 'blocked');
  await ctx.answerCbQuery(isMember ? "✅ You're in — restored!" : '❌ Still not seeing you in there.', { show_alert: true }).catch(() => {});
  const { text, markup } = await renderTasksMenu(ctx);
  await ctx.editMessageText(text, { parse_mode: 'HTML', ...markup }).catch(() => {});
});
bot.action(/^task_manual_done:(\d+)$/, async (ctx) => {
  const result = db.completeTaskTxn(ctx.from.id, ctx.from.username || ctx.from.first_name, Number(ctx.match[1]));
  await ctx.answerCbQuery(result.rewardPoints ? `🎉 Done! +${result.rewardPoints} points` : '✅ Marked done!').catch(() => {});
  const { text, markup } = await renderTasksMenu(ctx);
  await ctx.editMessageText(text, { parse_mode: 'HTML', ...markup }).catch(() => {});
});
bot.action(/^task_wa_start:(\d+)$/, async (ctx) => {
  awaitingScreenshot.set(ctx.from.id, Number(ctx.match[1]));
  await ctx.answerCbQuery().catch(() => {});
  await ctx.reply("📸 <b>Send a screenshot</b> showing you've joined the WhatsApp group, and I'll pass it along for a quick check.", { parse_mode: 'HTML' });
});
bot.on('photo', async (ctx) => {
  const taskId = awaitingScreenshot.get(ctx.from.id);
  if (!taskId) return;
  awaitingScreenshot.delete(ctx.from.id);
  const task = db.getTask(taskId);
  const photo = ctx.message.photo[ctx.message.photo.length - 1];
  const review = db.createReview({ userId: ctx.from.id, taskId, fileId: photo.file_id });
  db.setUserTaskStatus(ctx.from.id, taskId, 'awaiting_review');
  const adminChat = process.env.ADMIN_REVIEW_CHAT_ID;
  if (adminChat) {
    try {
      const sent = await bot.telegram.sendPhoto(adminChat, photo.file_id, {
        caption: `Review needed\nUser: ${escapeHtml(ctx.from.username || ctx.from.id)} (${ctx.from.id})\nTask: ${escapeHtml(task?.label || taskId)}`,
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([[styledCallback('✅ Approve', `review_approve:${review.id}`), styledCallback('❌ Reject', `review_reject:${review.id}`)]]),
      });
      db.setReviewAdminMessage(review.id, sent.message_id);
    } catch (err) { console.error('Could not reach admin review chat:', err.message); }
  }
  await ctx.reply("📤 <b>Sent for review.</b> You'll get a message here once it's checked.", { parse_mode: 'HTML' });
});
bot.action(/^review_(approve|reject):(\d+)$/, async (ctx) => {
  const decision = ctx.match[1];
  const review = db.getReview(Number(ctx.match[2]));
  if (!review) return ctx.answerCbQuery('Not found').catch(() => {});
  db.setReviewStatus(review.id, decision === 'approve' ? 'approved' : 'rejected');
  const rewardResult = decision === 'approve'
    ? db.completeTaskTxn(review.user_id, null, review.task_id)
    : (db.setUserTaskStatus(review.user_id, review.task_id, 'pending'), { rewardPoints: 0 });
  await ctx.answerCbQuery(decision === 'approve' ? 'Approved' : 'Rejected').catch(() => {});
  await ctx.editMessageCaption((ctx.update.callback_query.message.caption || '') + `\n\n${decision === 'approve' ? '✅ <b>APPROVED</b>' : '❌ <b>REJECTED</b>'}`, { parse_mode: 'HTML' }).catch(() => {});
  try {
    const task = db.getTask(review.task_id);
    await bot.telegram.sendMessage(
      review.user_id,
      decision === 'approve'
        ? `🎉 <b>Approved!</b> Your screenshot for "${escapeHtml(task?.label || '')}" was approved.${rewardResult.rewardPoints ? `\n\n🎁 <b>Task prize: +${rewardResult.rewardPoints} points!</b>` : ''}`
        : `❌ <b>Not accepted.</b> Your screenshot for "${escapeHtml(task?.label || '')}" wasn't accepted — please try again with a clearer screenshot.`,
      { parse_mode: 'HTML' }
    );
  } catch (e) { /* ignore */ }
});

// ============================================================
// ADMIN ANY-GIFT DELIVERY
// Telegram copyMessage preserves the original message type, so ZIPs and
// other supported Telegram media can be gifted without downloading/re-uploading.
// ============================================================
bot.on('message', async (ctx, next) => {
  const targetId = awaitingAdminGift.get(ctx.from?.id);
  if (!targetId || !isAdmin(ctx.from?.id)) return next();
  if (ctx.message?.text && /^\/(?:gift|giftpoints|cancelgift|admin|vipusers)(?:@\w+)?\b/i.test(ctx.message.text)) return next();
  const target = db.getUser(targetId);
  if (!target) {
    awaitingAdminGift.delete(ctx.from.id);
    return ctx.reply(tiny('ᴜsᴇʀ ɴᴏ ʟᴏɴɢᴇʀ ᴇxɪsᴛs. ɢɪғᴛ ᴍᴏᴅᴇ ᴄᴀɴᴄᴇʟʟᴇᴅ.'));
  }
  try {
    await bot.telegram.copyMessage(targetId, ctx.chat.id, ctx.message.message_id);
    awaitingAdminGift.delete(ctx.from.id);
    await ctx.reply(tiny(`🎁 ɢɪғᴛ sᴇɴᴛ ᴛᴏ ${target.username ? '@'+target.username : target.user_id}.`));
    try { await bot.telegram.sendMessage(targetId, tiny('🎁 ʏᴏᴜ ʜᴀᴠᴇ ʀᴇᴄᴇɪᴠᴇᴅ ᴀ ɢɪғᴛ ғʀᴏᴍ ʀᴜsʜ ᴀᴅᴍɪɴ!')); } catch (_) {}
  } catch (err) {
    console.error('Admin gift delivery failed:', err.message);
    await ctx.reply(tiny('❌ ɢɪғᴛ ᴄᴏᴜʟᴅ ɴᴏᴛ ʙᴇ sᴇɴᴛ. ᴍᴀᴋᴇ sᴜʀᴇ ᴛʜᴇ ᴜsᴇʀ ʜᴀs sᴛᴀʀᴛᴇᴅ ʀᴜsʜ.'));
  }
});

// ============================================================
// DROPS
// ============================================================
function dropCaption(drop) {
  const left = Math.max(drop.stock - drop.claimed_count, 0);
  const soldOut = left === 0;
  const expired = drop.expires_at && new Date(drop.expires_at) <= new Date();
  let statusLine;
  if (!drop.active && expired) statusLine = '⏰ <b>EXPIRED</b>';
  else if (soldOut) statusLine = `❌ <b>SOLD OUT</b> — ${drop.stock}/${drop.stock} claimed`;
  else statusLine = `🎯 <b>${drop.claimed_count}/${drop.stock} claimed</b> — ${left} left!`;
  return trc({
    title: drop.title,
    emoji: '🔥',
    intro: drop.description ? escapeHtml(drop.description) : '',
    sections: [{ title: 'Rush Status', emoji: '📦', content: statusLine }],
    footer: 'Tap the button below to claim while stock lasts.',
  });
}
function dropKeyboard(drop) {
  const soldOut = drop.claimed_count >= drop.stock;
  const expired = drop.expires_at && new Date(drop.expires_at) <= new Date();
  const label = expired ? '⏰ Expired' : soldOut ? '❌ Sold Out' : '🏃 RUSH — Claim Now';
  return Markup.inlineKeyboard([styledCallback(label, `claim:${drop.id}`)]);
}
async function postDrop(chatId, drop) {
  let msg;
  if (drop.image_url) {
    msg = await bot.telegram.sendPhoto(chatId, drop.image_url, { caption: dropCaption(drop), parse_mode: 'HTML', ...dropKeyboard(drop) });
  } else {
    msg = await bot.telegram.sendMessage(chatId, dropCaption(drop), { parse_mode: 'HTML', ...dropKeyboard(drop) });
  }
  db.setChatMessageId(drop.id, msg.message_id);
  return msg;
}
async function refreshMessage(chatId, drop) {
  try {
    if (!drop.chat_message_id) return;
    if (drop.image_url) {
      await bot.telegram.editMessageCaption(chatId, drop.chat_message_id, undefined, dropCaption(drop), { parse_mode: 'HTML', ...dropKeyboard(drop) });
    } else {
      await bot.telegram.editMessageText(chatId, drop.chat_message_id, undefined, dropCaption(drop), { parse_mode: 'HTML', ...dropKeyboard(drop) });
    }
  } catch (err) {
    if (!String(err.message).includes('message is not modified')) console.error('refreshMessage error:', err.message);
  }
}
bot.action(/^claim:(\d+)$/, async (ctx) => {
  const dropId = Number(ctx.match[1]);
  const userId = ctx.from.id;
  const username = ctx.from.username || ctx.from.first_name || `user${userId}`;
  const claimCode = genCode();
  const result = db.claimTxn(dropId, userId, username, claimCode);
  if (!result.ok) {
    const messages = {
      already_claimed: 'You already claimed this drop! Check your DMs.',
      sold_out: '😢 Sold out — better luck on the next drop!',
      expired: '⏰ This drop has expired.',
    };
    await ctx.answerCbQuery(messages[result.reason] || 'This drop is no longer available.', { show_alert: true });
    return;
  }
  await ctx.answerCbQuery('🎉 You claimed it!', { show_alert: true });
  try {
    await bot.telegram.sendMessage(
      userId,
      trc({
        title: 'You won a spot!',
        emoji: '🎉',
        intro: `Drop: <b>${escapeHtml(result.drop.title)}</b>`,
        sections: [
          ...(result.drop.prize_text ? [{ title: 'Prize', emoji: '🎁', content: escapeHtml(result.drop.prize_text) }] : []),
          { title: 'Claim Code', emoji: '🔐', content: code(claimCode) },
        ],
        footer: 'Keep this claim code safe.',
      }),
      { parse_mode: 'HTML' }
    );
  } catch (err) { console.error(`Could not DM user ${userId}:`, err.message); }
  await refreshMessage(ctx.chat.id, result.drop);
});

// Called from index.js on a timer: auto-post scheduled drops, auto-expire due drops.
async function sweepScheduledDrops() {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!chatId) return;
  for (const drop of db.listDueScheduledDrops()) {
    try {
      await postDrop(chatId, drop);
      db.markScheduledPosted(drop.id);
    } catch (err) { console.error('Failed to auto-post scheduled drop', drop.id, err.message); }
  }
}
async function sweepExpiredDrops() {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  for (const drop of db.listExpiredUnnotifiedDrops()) {
    const updated = db.expireDrop(drop.id);
    if (chatId) await refreshMessage(chatId, updated);
  }
}


bot.command('rushadmin',ctx=>{const ids=(process.env.ADMIN_USER_IDS||'').split(',').map(x=>x.trim()).filter(Boolean);if(!ids.includes(String(ctx.from.id)))return ctx.reply(tiny('❌ ᴀᴅᴍɪɴ ᴏɴʟʏ.'));const x=rushV10.adminStats();return ctx.reply(tiny(`👑 ʀᴜsʜ ᴇᴄᴏɴᴏᴍʏ ᴅᴀsʜʙᴏᴀʀᴅ
👥 ᴘʟᴀʏᴇʀs: ${x.players}
💰 ᴘᴏɪɴᴛs: ${x.points}
🐾 ᴘᴇᴛs: ${x.pets}
⚔️ ʙᴀᴛᴛʟᴇs: ${x.battles}`));});
bot.command('givepet',ctx=>{const ids=(process.env.ADMIN_USER_IDS||'').split(',').map(x=>x.trim());if(!ids.includes(String(ctx.from.id)))return ctx.reply(tiny('❌ ᴀᴅᴍɪɴ ᴏɴʟʏ.'));const p=ctx.message.text.trim().split(/\s+/).slice(1);if(p.length<2)return ctx.reply(tiny('ᴜsᴇ: /ɢɪᴠᴇᴘᴇᴛ <ᴜsᴇʀ_ɪᴅ> <ɴᴀᴍᴇ> [ʀᴀʀɪᴛʏ]'));rushV10.addPet(Number(p[0]),p[1],p[2]||'ᴄᴏᴍᴍᴏɴ');return ctx.reply(tiny('🐾 ᴘᴇᴛ ɢɪᴠᴇɴ.'));});


// ============================================================
// BOT STATUS — PING + UPTIME
// ============================================================
function formatUptime(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  return [d ? `${d}ᴅ` : '', h ? `${h}ʜ` : '', m ? `${m}ᴍ` : '', `${sec}s`].filter(Boolean).join(' ');
}

bot.command('maintenance', async (ctx) => {
  if (!adminGuard(ctx)) return;
  const arg = String(ctx.message?.text || '').trim().split(/\s+/)[1]?.toLowerCase();
  if (!arg || !['on','off'].includes(arg)) {
    return ctx.reply(tiny(`🛠️ ʀᴜsʜ ᴍᴀɪɴᴛᴇɴᴀɴᴄᴇ\n\n📍 sᴛᴀᴛᴜs: ${maintenanceMode ? '🔴 ᴏɴ' : '🟢 ᴏғғ'}\n\nᴜsᴇ: /ᴍᴀɪɴᴛᴇɴᴀɴᴄᴇ ᴏɴ\nᴏʀ: /ᴍᴀɪɴᴛᴇɴᴀɴᴄᴇ ᴏғғ`));
  }
  maintenanceMode = arg === 'on';
  return ctx.reply(tiny(maintenanceMode
    ? '🛠️ ᴍᴀɪɴᴛᴇɴᴀɴᴄᴇ ᴍᴏᴅᴇ ᴇɴᴀʙʟᴇᴅ. ᴏɴʟʏ ᴀᴅᴍɪɴs ᴄᴀɴ ᴜsᴇ ʀᴜsʜ.'
    : '✅ ᴍᴀɪɴᴛᴇɴᴀɴᴄᴇ ᴍᴏᴅᴇ ᴅɪsᴀʙʟᴇᴅ. ʀᴜsʜ ɪs ʙᴀᴄᴋ ᴏɴʟɪɴᴇ.'
  ));
});

bot.command('ping', async (ctx) => {
  const started = Date.now();
  try {
    const sent = await ctx.reply(tiny('🏓 ᴘᴏɴɢ...'));
    const ms = Date.now() - started;
    const text = [
      '🏓 ᴘᴏɴɢ!',
      '',
      `⚡ ʟᴀᴛᴇɴᴄʏ: ${ms}ᴍs`,
      `⏱️ ᴜᴘᴛɪᴍᴇ: ${formatUptime(process.uptime())}`,
      '🟢 sᴛᴀᴛᴜs: ᴀᴄᴛɪᴠᴇ',
    ].join('\n');
    await ctx.telegram.editMessageText(ctx.chat.id, sent.message_id, undefined, tiny(text)).catch(() => {});
  } catch (err) {
    safeError('ping command', err);
  }
});

bot.command('uptime', async (ctx) => {
  try {
    const text = [
      '⏱️ ʀᴜsʜ ᴜᴘᴛɪᴍᴇ',
      '',
      `🟢 ᴀᴄᴛɪᴠᴇ ғᴏʀ: ${formatUptime(process.uptime())}`,
      '📡 sᴛᴀᴛᴜs: ᴏɴʟɪɴᴇ',
      '⚡ ʙᴏᴛ: ʀᴜɴɴɪɴɢ',
    ].join('\n');
    await ctx.reply(tiny(text));
  } catch (err) {
    safeError('uptime command', err);
  }
});

// ============================================================
// UNHANDLED CALLBACK SAFETY
// A stale/missing handler must never leave the user tapping a dead button
// with no feedback. Matched actions run first; this only handles leftovers.
// ============================================================
bot.on('callback_query', async (ctx) => {
  try {
    await ctx.answerCbQuery(tiny('⚠️ ᴛʜɪs ʙᴜᴛᴛᴏɴ ɪs ɴᴏ ʟᴏɴɢᴇʀ ᴀᴄᴛɪᴠᴇ. ᴏᴘᴇɴ ᴛʜᴇ ᴍᴇɴᴜ ᴀɢᴀɪɴ.'), { show_alert: true });
  } catch (_) {}
});

module.exports = { bot, postDrop, refreshMessage, sweepScheduledDrops, sweepExpiredDrops };
