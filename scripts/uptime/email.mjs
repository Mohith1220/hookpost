/**
 * Alert and recovery emails for the uptime monitor. Same light layout as the
 * product emails (libraries/nestjs-libraries/src/emails/layout/email.layout.ts):
 * white 600px card on #F6F8FB, brand accent bar, inline styles, system fonts.
 * Kept dependency-free because the workflow runs it with plain node.
 */

const C = {
  page: '#F6F8FB',
  card: '#FFFFFF',
  border: '#E6E9EF',
  heading: '#111827',
  text: '#1F2937',
  body: '#4B5563',
  muted: '#6B7280',
  faint: '#9CA3AF',
  primary: '#5B5BD6',
  panel: '#F9FAFB',
  cyan: '#06B6D4',
  indigo: '#6366F1',
  pink: '#FF4CE2',
  red: '#B42318',
  green: '#067647',
};
const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
// Never a street address, never the legal name.
export const FOOTER_LINE = 'Hookstep · Ghatkopar, Mumbai, India';

export function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** "29 Sep 2026, 4:05 pm IST" */
export function formatIst(date) {
  const s = new Date(date).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return `${s} IST`;
}

function rowsHtml(rows) {
  return rows
    .map(([k, v], i) => {
      const border = i < rows.length - 1 ? `border-bottom:1px solid ${C.border};` : '';
      return `<tr><td valign="top" style="padding:10px 16px;${border}font-family:${FONT};font-size:14px;line-height:20px;color:${C.muted};white-space:nowrap;">${esc(k)}</td><td valign="top" style="padding:10px 16px;${border}font-family:${FONT};font-size:14px;line-height:20px;color:${C.text};font-weight:600;text-align:right;word-break:break-word;overflow-wrap:anywhere;">${v}</td></tr>`;
    })
    .join('');
}

function layout({ title, preheader, badge, badgeColor, heading, intro, rows, buttonLabel, buttonUrl }) {
  const filler = '&#847;&zwnj;&nbsp;'.repeat(40);
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><meta name="color-scheme" content="light" /><meta name="supported-color-schemes" content="light" /><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;width:100%;background-color:${C.page};">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;color:${C.page};">${esc(preheader)}${filler}</div>
<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" bgcolor="${C.page}" style="background-color:${C.page};">
<tr><td align="center" style="padding:32px 12px;">
<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;">
<tr><td align="left" style="padding:0 4px 20px 4px;font-family:${FONT};font-size:17px;line-height:36px;font-weight:700;color:${C.heading};">Hookstep status</td></tr>
<tr><td style="background-color:${C.card};border:1px solid ${C.border};border-radius:12px;overflow:hidden;">
<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0">
<tr><td height="4" bgcolor="${C.indigo}" style="height:4px;font-size:0;line-height:0;background-color:${C.indigo};background-image:linear-gradient(90deg, ${C.cyan} 0%, ${C.indigo} 50%, ${C.pink} 100%);border-radius:12px 12px 0 0;">&nbsp;</td></tr>
<tr><td style="padding:32px 32px 16px 32px;font-family:${FONT};font-size:15px;line-height:24px;color:${C.body};">
<p style="margin:0 0 12px 0;font-family:${FONT};font-size:12px;line-height:16px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${badgeColor};">${esc(badge)}</p>
<h1 style="margin:0 0 16px 0;font-family:${FONT};font-size:22px;line-height:30px;font-weight:700;color:${C.heading};">${esc(heading)}</h1>
<p style="margin:0 0 16px 0;font-family:${FONT};font-size:15px;line-height:24px;color:${C.body};">${intro}</p>
<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="margin:4px 0 24px 0;border:1px solid ${C.border};border-radius:8px;border-collapse:separate;background-color:${C.panel};">${rowsHtml(rows)}</table>
${
  buttonUrl
    ? `<table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin:8px 0 24px 0;border-collapse:separate;"><tr><td align="center" bgcolor="${C.primary}" style="border-radius:8px;background-color:${C.primary};"><a href="${esc(buttonUrl)}" target="_blank" style="display:inline-block;padding:13px 28px;font-family:${FONT};font-size:15px;line-height:20px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:8px;">${esc(buttonLabel)}</a></td></tr></table>`
    : ''
}
</td></tr></table>
</td></tr>
<tr><td align="center" style="padding:24px 24px 8px 24px;font-family:${FONT};font-size:12px;line-height:18px;color:${C.muted};">
<p style="margin:0 0 6px 0;">${esc(FOOTER_LINE)}</p>
<p style="margin:0;color:${C.faint};">Sent by the uptime monitor (.github/workflows/uptime.yml). One email when a check goes down, one when it recovers.</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

function text(lines) {
  return (
    lines.filter((l) => l !== null).join('\n') +
    `\n\n--\n${FOOTER_LINE}\nSent by the uptime monitor. One email when a check goes down, one when it recovers.\n`
  );
}

/** A check has now failed twice in a row. */
export function downEmail({ check, target, error, firstFailedAt, issueUrl }) {
  const subject = `DOWN: ${check}`;
  const rows = [
    ['Check', esc(check)],
    ['Target', esc(target)],
    ['Error', esc(error)],
    ['Failing since', esc(formatIst(firstFailedAt))],
  ];
  return {
    subject,
    html: layout({
      title: subject,
      preheader: `${check}: ${error}`,
      badge: 'Down',
      badgeColor: C.red,
      heading: `${check} is down`,
      intro: 'It failed on two runs in a row (the monitor runs about every 5 minutes). You will get one more email when it recovers.',
      rows,
      buttonLabel: 'Open the issue',
      buttonUrl: issueUrl,
    }),
    text: text([
      `${check} is down`,
      '',
      'It failed on two runs in a row (the monitor runs about every 5 minutes). You will get one more email when it recovers.',
      '',
      `Check: ${check}`,
      `Target: ${target}`,
      `Error: ${error}`,
      `Failing since: ${formatIst(firstFailedAt)}`,
      issueUrl ? `Issue: ${issueUrl}` : null,
    ]),
  };
}

/** A check that had an open DOWN issue passes again. */
export function recoveredEmail({ check, target, minutes, recoveredAt, issueUrl }) {
  const subject = `RECOVERED: ${check}`;
  const rows = [
    ['Check', esc(check)],
    ['Target', esc(target)],
    ['Down for', `${minutes} min`],
    ['Recovered at', esc(formatIst(recoveredAt))],
  ];
  return {
    subject,
    html: layout({
      title: subject,
      preheader: `${check} recovered after ${minutes} min.`,
      badge: 'Recovered',
      badgeColor: C.green,
      heading: `${check} is back up`,
      intro: `It recovered after ${minutes} min. The issue has been closed.`,
      rows,
      buttonLabel: 'Open the issue',
      buttonUrl: issueUrl,
    }),
    text: text([
      `${check} is back up`,
      '',
      `It recovered after ${minutes} min. The issue has been closed.`,
      '',
      `Check: ${check}`,
      `Target: ${target}`,
      `Down for: ${minutes} min`,
      `Recovered at: ${formatIst(recoveredAt)}`,
      issueUrl ? `Issue: ${issueUrl}` : null,
    ]),
  };
}
