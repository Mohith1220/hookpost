import {
  appUrl,
  buildEmail,
  button,
  escapeHtml,
  heading,
  htmlToText,
  paragraph,
  RenderedEmail,
} from '@hookpost/nestjs-libraries/emails/layout/email.layout';

const LINK_STYLE = 'color:#5B5BD6;text-decoration:underline;word-break:break-all;';
const PARAGRAPH_STYLE = 'margin:0 0 16px 0;font-size:15px;line-height:24px;color:#4B5563;';

/** Old callers sometimes pass a whole <html> document as the "fragment". */
function stripDocumentShell(html: string): string {
  const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  let s = body ? body[1] : html;
  s = s.replace(/<head[\s\S]*?<\/head>/gi, '');
  s = s.replace(/<\/?(html|body)[^>]*>/gi, '');
  s = s.replace(/<!DOCTYPE[^>]*>/gi, '');
  return s.trim();
}

/** Turn bare URLs into links. Skips anything that already has links. */
function linkify(html: string): string {
  if (/<a\s/i.test(html)) return html;
  return html
    .split(/(<[^>]+>)/)
    .map((part) =>
      part.startsWith('<')
        ? part
        : part.replace(
            /https?:\/\/[^\s<>"']*[^\s<>"'.,;:!?)]/g,
            (url) => `<a href="${url}" style="${LINK_STYLE}">${url}</a>`
          )
    )
    .join('');
}

function hasBlockMarkup(html: string): boolean {
  return /<(p|div|table|h[1-6]|ul|ol)[\s>]/i.test(html);
}

/**
 * Everything that reaches the email service as a bare HTML fragment (post
 * published / failed notifications, digests, streak reminders, internal admin
 * notes) is wrapped here: the subject becomes the heading, the fragment is the
 * body, and there is one button back into the app.
 *
 * The fragment is trusted HTML from our own code, as it always was; it is not
 * escaped here so existing callers render exactly what they meant to.
 */
export function notificationEmail(subject: string, fragment: string): RenderedEmail {
  const content = linkify(stripDocumentShell(fragment || '')).replace(
    /<p>/gi,
    `<p style="${PARAGRAPH_STYLE}">`
  );
  const bodyHtml = hasBlockMarkup(content) ? content : paragraph(content);
  const preview = htmlToText(content).replace(/\s+/g, ' ').trim().slice(0, 140);

  return buildEmail(subject, {
    preheader: preview,
    kind: 'lifecycle',
    body:
      heading(escapeHtml(subject)) +
      bodyHtml +
      button('Open Hookpost', `${appUrl()}/launches`),
  });
}
