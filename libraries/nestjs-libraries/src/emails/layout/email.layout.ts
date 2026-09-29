/**
 * The one email layout every Hookpost email is rendered with.
 *
 * Built for the clients people actually read mail in: Gmail (web and app),
 * Apple Mail and Outlook for Windows. That rules out a lot of normal web
 * practice, so a few rules here are load-bearing:
 *
 * - Tables for layout, 600px single column. Outlook ignores max-width on divs,
 *   so the column is also pinned with an MSO-only table.
 * - Inline styles only, no <style> block, no web fonts. Gmail strips or
 *   rewrites a lot of head CSS; a system font stack looks native everywhere.
 * - The button is a table cell with a background colour, so it still looks
 *   like a button when images and CSS padding are ignored (Outlook).
 * - Colours are picked to survive forced dark mode: the logo carries its own
 *   dark tile (no black-on-transparent artwork) and text is dark grey on white,
 *   which Gmail and Outlook invert cleanly.
 *
 * Keep this file free of imports (Node, Nest or otherwise). The lead-drip
 * cron script runs as plain JS on the server, so it uses an esbuild bundle of
 * this file (scripts/lead-campaign/lead-email.generated.js). Run
 * scripts/lead-campaign/build-lead-email.sh after changing it.
 */

export type EmailKind = 'transactional' | 'lifecycle' | 'marketing';

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export const EMAIL_BRAND = {
  name: 'Hookpost',
  defaultAppUrl: 'https://hookpost.hookstep.in',
  logoUrl: 'https://hookpost.hookstep.in/brand-logo-96.png',
  supportEmail: 'support@hookstep.in',
  // Never put a street address here. The founder asked for the city only on
  // anything public.
  legalLine: 'Hookpost by Hookstep · Ghatkopar, Mumbai, India',
  colors: {
    page: '#F6F8FB',
    card: '#FFFFFF',
    border: '#E6E9EF',
    heading: '#111827',
    text: '#1F2937',
    body: '#4B5563',
    muted: '#6B7280',
    faint: '#9CA3AF',
    primary: '#5B5BD6',
    primaryText: '#FFFFFF',
    panel: '#F9FAFB',
    // brand gradient, taken from the logo
    cyan: '#06B6D4',
    indigo: '#6366F1',
    pink: '#FF4CE2',
  },
  font:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
};

const C = EMAIL_BRAND.colors;
const FONT = EMAIL_BRAND.font;

/** Marker the email service uses to tell a finished email from a fragment. */
export const EMAIL_LAYOUT_MARKER = '<!--hookpost-email-layout-->';

export function isRenderedEmail(html: string | undefined | null): boolean {
  return !!html && html.indexOf(EMAIL_LAYOUT_MARKER) > -1;
}

/** FRONTEND_URL when it is set, otherwise the production URL. */
export function appUrl(): string {
  let fromEnv = '';
  try {
    fromEnv = (typeof process !== 'undefined' && process.env?.FRONTEND_URL) || '';
  } catch {
    fromEnv = '';
  }
  return (fromEnv || EMAIL_BRAND.defaultAppUrl).replace(/\/+$/, '');
}

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** For values that go inside href="...". */
export function escapeAttr(value: unknown): string {
  return escapeHtml(value);
}

// ---------------------------------------------------------------------------
// Content blocks. Each returns an HTML string meant to sit inside the card.
// Dynamic values must be escaped by the caller (use escapeHtml) unless they
// are trusted HTML.
// ---------------------------------------------------------------------------

export function heading(text: string): string {
  return `<h1 style="margin:0 0 16px 0;font-family:${FONT};font-size:22px;line-height:30px;font-weight:700;color:${C.heading};">${text}</h1>`;
}

export function paragraph(html: string, opts: { muted?: boolean; small?: boolean } = {}): string {
  const size = opts.small ? '13px' : '15px';
  const lh = opts.small ? '20px' : '24px';
  const color = opts.muted ? C.muted : C.body;
  return `<p style="margin:0 0 16px 0;font-family:${FONT};font-size:${size};line-height:${lh};color:${color};">${html}</p>`;
}

export function strong(html: string): string {
  return `<strong style="color:${C.text};font-weight:600;">${html}</strong>`;
}

export function link(label: string, url: string): string {
  return `<a href="${escapeAttr(url)}" style="color:${C.primary};text-decoration:underline;">${label}</a>`;
}

/**
 * Bulletproof button. The coloured table cell is the button in Outlook (which
 * ignores padding on links); everywhere else the padded link fills it, so the
 * whole button is clickable.
 */
export function button(label: string, url: string): string {
  const href = escapeAttr(url);
  return `<table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin:8px 0 24px 0;border-collapse:separate;">
<tr><td align="center" bgcolor="${C.primary}" style="border-radius:8px;background-color:${C.primary};mso-padding-alt:13px 28px;">
<a data-hp-button href="${href}" target="_blank" style="display:inline-block;padding:13px 28px;font-family:${FONT};font-size:15px;line-height:20px;font-weight:600;color:${C.primaryText};text-decoration:none;border-radius:8px;">${label}</a>
</td></tr></table>`;
}

/** "If the button doesn't work" line, for links people must be able to use. */
export function linkFallback(url: string): string {
  const href = escapeAttr(url);
  return `<p data-hp-skip-text style="margin:0 0 20px 0;font-family:${FONT};font-size:13px;line-height:20px;color:${C.muted};">If the button doesn't work, copy this link into your browser:<br /><a href="${href}" style="color:${C.primary};text-decoration:underline;word-break:break-all;">${escapeHtml(url)}</a></p>`;
}

/** Label/value rows in a light panel: plan, amount, workspace and so on. */
export function details(rows: Array<[string, string]>): string {
  const body = rows
    .map(([label, value], i) => {
      const border = i < rows.length - 1 ? `border-bottom:1px solid ${C.border};` : '';
      return `<tr>
<td data-hp-label style="padding:10px 16px;${border}font-family:${FONT};font-size:14px;line-height:20px;color:${C.muted};" valign="top">${label}</td>
<td style="padding:10px 16px;${border}font-family:${FONT};font-size:14px;line-height:20px;color:${C.text};font-weight:600;text-align:right;word-break:break-word;overflow-wrap:anywhere;" valign="top">${value}</td>
</tr>`;
    })
    .join('');
  return `<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="margin:4px 0 24px 0;border:1px solid ${C.border};border-radius:8px;border-collapse:separate;background-color:${C.panel};">${body}</table>`;
}

/** Numbered or bulleted steps. Table-based so Outlook keeps the spacing. */
export function steps(items: string[], opts: { numbered?: boolean } = {}): string {
  const rows = items
    .map((item, i) => {
      const marker = opts.numbered ? `${i + 1}.` : '&bull;';
      return `<tr>
<td data-hp-marker valign="top" style="width:22px;padding:0 0 10px 0;font-family:${FONT};font-size:15px;line-height:24px;color:${C.primary};font-weight:600;">${marker}</td>
<td valign="top" style="padding:0 0 10px 0;font-family:${FONT};font-size:15px;line-height:24px;color:${C.body};">${item}</td>
</tr>`;
    })
    .join('');
  return `<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="margin:0 0 16px 0;">${rows}</table>`;
}

/** A quiet panel for a note, a quote or a help line. */
export function callout(html: string): string {
  return `<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="margin:8px 0 24px 0;">
<tr><td style="padding:16px 18px;background-color:${C.panel};border:1px solid ${C.border};border-radius:8px;font-family:${FONT};font-size:14px;line-height:22px;color:${C.body};">${html}</td></tr></table>`;
}

export function signoff(name: string, role?: string): string {
  return `<p style="margin:8px 0 16px 0;font-family:${FONT};font-size:15px;line-height:24px;color:${C.body};">${name}${
    role ? `<br /><span style="font-size:13px;color:${C.muted};">${role}</span>` : ''
  }</p>`;
}

export function divider(): string {
  return `<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="margin:8px 0 20px 0;"><tr><td style="border-top:1px solid ${C.border};font-size:0;line-height:0;height:1px;">&nbsp;</td></tr></table>`;
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export interface EmailLayoutOptions {
  /** Used for <title>; clients show it in a few places (Outlook print view). */
  title: string;
  /** Hidden preview text shown next to the subject in the inbox list. */
  preheader: string;
  /** The card's contents, built from the blocks above. */
  body: string;
  kind: EmailKind;
  /** Lifecycle mail: where the "email preferences" link points. */
  preferencesUrl?: string;
  /** Marketing mail: where "unsubscribe" points. */
  unsubscribeUrl?: string;
  /** One line under the legal line saying why this email arrived. */
  reason?: string;
}

function preheaderBlock(text: string): string {
  // The filler stops clients from pulling body text into the preview after
  // the preheader runs out.
  const filler = '&#847;&zwnj;&nbsp;'.repeat(60);
  return `<!--hp:preheader--><div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;color:${C.page};">${escapeHtml(
    text
  )}${filler}</div><!--/hp:preheader-->`;
}

function footerBlock(opts: EmailLayoutOptions): string {
  const support = EMAIL_BRAND.supportEmail;
  const linkStyle = `color:${C.muted};text-decoration:underline;`;
  const links: string[] = [
    `<a href="mailto:${support}" style="${linkStyle}">${support}</a>`,
  ];
  if (opts.kind === 'lifecycle') {
    links.push(
      `<a href="${escapeAttr(opts.preferencesUrl || `${appUrl()}/settings`)}" style="${linkStyle}">Email preferences</a>`
    );
  }
  if (opts.kind === 'marketing') {
    links.push(
      `<a href="${escapeAttr(
        opts.unsubscribeUrl || `mailto:${support}?subject=Unsubscribe`
      )}" style="${linkStyle}">Unsubscribe</a>`
    );
  }

  const reason =
    opts.reason ||
    (opts.kind === 'transactional'
      ? 'You received this email because of activity on your Hookpost account.'
      : opts.kind === 'lifecycle'
      ? 'You received this email because notifications are on for your Hookpost workspace.'
      : 'You received this email because you signed up for Hookpost.');

  return `<tr><td align="center" style="padding:24px 24px 8px 24px;font-family:${FONT};font-size:12px;line-height:18px;color:${C.muted};">
<p style="margin:0 0 6px 0;">${EMAIL_BRAND.legalLine}</p>
<p style="margin:0 0 6px 0;">${links.join(' &nbsp;&middot;&nbsp; ')}</p>
<p style="margin:0;color:${C.faint};">${escapeHtml(reason)}</p>
</td></tr>`;
}

export function renderEmailLayout(opts: EmailLayoutOptions): string {
  const home = appUrl();
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<meta name="x-apple-disable-message-reformatting" />
<meta name="format-detection" content="telephone=no, date=no, address=no, email=no" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title>${escapeHtml(opts.title)}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
</head>
<body style="margin:0;padding:0;width:100%;background-color:${C.page};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
${EMAIL_LAYOUT_MARKER}
${preheaderBlock(opts.preheader)}
<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" bgcolor="${C.page}" style="background-color:${C.page};">
<tr><td align="center" style="padding:32px 12px;">
<!--[if mso]><table role="presentation" width="600" align="center" border="0" cellpadding="0" cellspacing="0"><tr><td><![endif]-->
<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;">
<tr><td align="left" style="padding:0 4px 20px 4px;">
<a data-hp-brand href="${escapeAttr(home)}" style="text-decoration:none;display:inline-block;">
<img src="${EMAIL_BRAND.logoUrl}" width="36" height="36" alt="Hookpost" style="display:inline-block;vertical-align:middle;width:36px;height:36px;border:0;outline:none;border-radius:8px;" /><span style="display:inline-block;vertical-align:middle;padding-left:10px;font-family:${FONT};font-size:17px;line-height:36px;font-weight:700;color:${C.heading};letter-spacing:-0.2px;">Hookpost</span>
</a>
</td></tr>
<tr><td style="background-color:${C.card};border:1px solid ${C.border};border-radius:12px;overflow:hidden;">
<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0">
<tr><td height="4" bgcolor="${C.indigo}" style="height:4px;font-size:0;line-height:0;background-color:${C.indigo};background-image:linear-gradient(90deg, ${C.cyan} 0%, ${C.indigo} 50%, ${C.pink} 100%);border-radius:12px 12px 0 0;">&nbsp;</td></tr>
<tr><td style="padding:32px 32px 16px 32px;font-family:${FONT};font-size:15px;line-height:24px;color:${C.body};">
${opts.body}
</td></tr>
</table>
</td></tr>
${footerBlock(opts)}
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Plain text
// ---------------------------------------------------------------------------

function decodeEntities(s: string): string {
  const named: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
    middot: '·',
    bull: '•',
    rarr: '→',
    larr: '←',
    mdash: '—',
    ndash: '–',
    hellip: '…',
    copy: '©',
    rsquo: '’',
    lsquo: '‘',
    rdquo: '”',
    ldquo: '“',
    zwnj: '',
    zwj: '',
    emsp: ' ',
    ensp: ' ',
    thinsp: ' ',
  };
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => {
      const code = parseInt(h, 16);
      return code === 847 || code === 8203 ? '' : String.fromCodePoint(code);
    })
    .replace(/&#(\d+);/g, (_, d) => {
      const code = parseInt(d, 10);
      return code === 847 || code === 8203 ? '' : String.fromCodePoint(code);
    })
    .replace(/&([a-z]+);/gi, (m, n) => (n.toLowerCase() in named ? named[n.toLowerCase()] : m));
}

function hrefOf(tag: string): string {
  const m = tag.match(/href\s*=\s*"([^"]*)"/i) || tag.match(/href\s*=\s*'([^']*)'/i);
  return m ? decodeEntities(m[1]) : '';
}

/**
 * Plain-text version of an email, for the text/plain part. Written for the
 * markup the blocks above produce, but degrades sensibly on any HTML.
 */
export function htmlToText(html: string): string {
  let s = html || '';
  s = s.replace(/<!--hp:preheader-->[\s\S]*?<!--\/hp:preheader-->/g, '');
  s = s.replace(/<head[\s\S]*?<\/head>/gi, '');
  s = s.replace(/<(style|script|title)[\s\S]*?<\/\1>/gi, '');
  s = s.replace(/<!--\[if[\s\S]*?<!\[endif\]-->/gi, '');
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  // Table markup is indented across lines; keep a row's cells on one line.
  s = s.replace(/<\/td>\s+<td/gi, '</td><td').replace(/<tr([^>]*)>\s+<td/gi, '<tr$1><td');
  // The logo/wordmark header adds nothing in plain text.
  s = s.replace(/<a[^>]*data-hp-brand[^>]*>[\s\S]*?<\/a>/gi, '');
  // The "button doesn't work" line only repeats the button's URL.
  s = s.replace(/<p[^>]*data-hp-skip-text[^>]*>[\s\S]*?<\/p>/gi, '');
  // Buttons: "Label: URL" on their own line.
  s = s.replace(/<a([^>]*data-hp-button[^>]*)>([\s\S]*?)<\/a>/gi, (_, attrs, label) => {
    const text = decodeEntities(label.replace(/<[^>]+>/g, '')).trim();
    return `\n\n${text}: ${hrefOf(attrs)}\n\n`;
  });
  // Other links: "text (url)", unless the text already is the url.
  s = s.replace(/<a([^>]*)>([\s\S]*?)<\/a>/gi, (_, attrs, label) => {
    const text = decodeEntities(label.replace(/<[^>]+>/g, '')).trim();
    let href = hrefOf(attrs);
    if (!href) return text;
    const bare = href.replace(/^mailto:/i, '').split('?')[0];
    if (!text) return href;
    if (text === href || text === bare) return text;
    // A bare mailto reads as the address; one with a subject must stay a link.
    if (/^mailto:[^?]*$/i.test(href)) href = href.replace(/^mailto:/i, '');
    return `${text} (${href})`;
  });
  s = s.replace(/<img[^>]*>/gi, '');
  s = s.replace(/<td[^>]*data-hp-label[^>]*>([\s\S]*?)<\/td>/gi, '$1: ');
  s = s.replace(/<td[^>]*data-hp-marker[^>]*>([\s\S]*?)<\/td>/gi, '$1 ');
  s = s.replace(/<li[^>]*>/gi, '\n- ');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<\/(p|h[1-6]|table|ul|ol|blockquote)>/gi, '\n\n');
  s = s.replace(/<\/(tr|div|li)>/gi, '\n');
  s = s.replace(/<\/td>/gi, ' ');
  s = s.replace(/<[^>]+>/g, '');
  s = decodeEntities(s);
  s = s
    .split('\n')
    .map((line) => line.replace(/[ \t ]+/g, ' ').trim())
    .join('\n');
  s = s.replace(/\n{3,}/g, '\n\n').trim();
  return s + '\n';
}

/** Render the layout and the matching plain text in one go. */
export function buildEmail(subject: string, opts: Omit<EmailLayoutOptions, 'title'> & { title?: string }): RenderedEmail {
  const html = renderEmailLayout({ ...opts, title: opts.title || subject });
  return { subject, html, text: htmlToText(html) };
}
