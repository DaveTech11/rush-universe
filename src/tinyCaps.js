// Rush Bot V3 — Tiny Caps Text + TRC helpers
// Use tiny(text) for all user-facing copy. Keep URLs, code, usernames and IDs unchanged when needed.

const MAP = {
  A:"ᴀ",B:"ʙ",C:"ᴄ",D:"ᴅ",E:"ᴇ",F:"ғ",G:"ɢ",H:"ʜ",I:"ɪ",J:"ᴊ",K:"ᴋ",L:"ʟ",M:"ᴍ",
  N:"ɴ",O:"ᴏ",P:"ᴘ",Q:"ǫ",R:"ʀ",S:"s",T:"ᴛ",U:"ᴜ",V:"ᴠ",W:"ᴡ",X:"x",Y:"ʏ",Z:"ᴢ"
};

function tiny(value) {
  return String(value).replace(/[A-Z]/g, ch => MAP[ch]);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const trc = {
  title: value => `<b>${tiny(escapeHtml(value))}</b>`,
  italic: value => `<i>${tiny(escapeHtml(value))}</i>`,
  bold: value => `<b>${tiny(escapeHtml(value))}</b>`,
  code: value => `<code>${escapeHtml(value)}</code>`,
  quote: value => `<blockquote>${tiny(escapeHtml(value))}</blockquote>`,
  line: () => "━━━━━━━━━━━━━━━━━━━━",
  bullet: value => `• ${tiny(escapeHtml(value))}`,
  message({ title, body = "", footer = "" }) {
    return [
      title ? trc.title(title) : "",
      body ? tiny(body) : "",
      footer ? trc.italic(footer) : ""
    ].filter(Boolean).join("\n\n");
  }
};

module.exports = { tiny, escapeHtml, trc };
