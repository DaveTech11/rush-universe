// Telegram Rich Content (TRC-style) helpers.
// Telegram bots don't have a native HTML/CSS table/card protocol, so TRC
// is rendered with Telegram's supported HTML entities plus compact <pre>
// blocks for table-like layouts.

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

const bold = (value) => `<b>${escapeHtml(value)}</b>`;
const italic = (value) => `<i>${escapeHtml(value)}</i>`;
const underline = (value) => `<u>${escapeHtml(value)}</u>`;
const strike = (value) => `<s>${escapeHtml(value)}</s>`;
const code = (value) => `<code>${escapeHtml(value)}</code>`;
const pre = (value) => `<pre>${escapeHtml(value)}</pre>`;
const link = (label, url) => `<a href="${escapeHtml(url)}">${escapeHtml(label)}</a>`;
const quote = (value) => `<blockquote>${escapeHtml(value)}</blockquote>`;

const divider = '──────────────';
const heading = (value, emoji = '') => `${emoji ? `${emoji} ` : ''}<b>${escapeHtml(value)}</b>`;
const subheading = (value, emoji = '') => `${emoji ? `${emoji} ` : ''}<b><i>${escapeHtml(value)}</i></b>`;
const bullet = (value) => `• ${value}`;
const numbered = (number, value) => `${number}. ${value}`;

function table(headers = [], rows = []) {
  const all = [headers, ...rows].map((row) => row.map((v) => String(v)));
  if (!all.length || !all[0].length) return '';

  const widths = all[0].map((_, i) => Math.max(...all.map((row) => (row[i] || '').length), 1));
  const fit = (value, width) => {
    const text = String(value ?? '');
    return text.length > width ? `${text.slice(0, Math.max(0, width - 1))}…` : text.padEnd(width);
  };
  const line = (row) => `│ ${row.map((v, i) => fit(v, widths[i])).join(' │ ')} │`;
  const rule = (left, middle, right, fill = '─') => `${left}${widths.map((w) => fill.repeat(w + 2)).join(middle)}${right}`;

  return [
    rule('┌', '┬', '┐'),
    line(all[0]),
    rule('├', '┼', '┤'),
    ...all.slice(1).map(line),
    rule('└', '┴', '┘'),
  ].join('\n');
}

function card({ title, emoji = '', body = '', footer = '' } = {}) {
  const parts = [heading(title, emoji)];
  if (body) parts.push(body);
  if (footer) parts.push(italic(footer));
  return parts.join('\n\n');
}

function trc({ title, emoji = '', intro = '', sections = [], footer = '' } = {}) {
  const parts = [];
  if (title) parts.push(heading(title, emoji));
  if (intro) parts.push(intro);

  for (const section of sections) {
    if (section.title) parts.push(subheading(section.title, section.emoji || ''));
    if (section.content) parts.push(section.content);
    if (section.items?.length) parts.push(section.items.map(bullet).join('\n'));
    if (section.table) parts.push(pre(table(section.table.headers, section.table.rows)));
  }

  if (footer) parts.push(quote(footer));
  return parts.filter(Boolean).join('\n\n');
}

module.exports = {
  escapeHtml,
  bold,
  italic,
  underline,
  strike,
  code,
  pre,
  link,
  quote,
  divider,
  heading,
  subheading,
  bullet,
  numbered,
  table,
  card,
  trc,
};
