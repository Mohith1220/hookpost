import {
  buildEmail,
  escapeHtml,
  heading,
  paragraph,
  RenderedEmail,
  strong,
} from '@hookpost/nestjs-libraries/emails/layout/email.layout';

/**
 * Sent once, the first time a user saves an agency listing. There is no review
 * step, so the listing is live when this goes out. No link and no timing: the
 * app has no public agency directory page today (/agencies needs a login), so
 * anything more would promise a page that does not exist.
 */
export function agencyListedEmail(params: { agencyName?: string | null }): RenderedEmail {
  const name = params.agencyName || 'Your agency';
  return buildEmail('Your agency is listed on Hookpost', {
    preheader: `${name} is now listed in the Hookpost agency directory.`,
    kind: 'transactional',
    body:
      heading('Your agency is listed') +
      paragraph(
        `${strong(escapeHtml(name))} is now listed in the Hookpost agency directory. There is no review step: the listing went live when you saved it, and any change you make later goes live the same way.`
      ) +
      paragraph('Questions about your listing? Reply to this email and a person will answer.', {
        muted: true,
        small: true,
      }),
  });
}
