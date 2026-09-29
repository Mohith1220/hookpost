import {
  buildEmail,
  button,
  details,
  escapeHtml,
  heading,
  link,
  paragraph,
  RenderedEmail,
  strong,
} from '@hookpost/nestjs-libraries/emails/layout/email.layout';

const SITE = 'https://hookpost.hookstep.in';

export function agencyApprovedEmail(params: {
  agencyName?: string | null;
  agencySlug?: string | null;
}): RenderedEmail {
  const name = params.agencyName || 'Your agency';
  const url = `${SITE}/agencies/${params.agencySlug ?? ''}`;
  return buildEmail('Your agency is live on Hookpost', {
    preheader: `${name} is approved and listed in the Hookpost agency directory.`,
    kind: 'transactional',
    body:
      heading('Your agency is approved') +
      paragraph(
        `${strong(escapeHtml(name))} is approved and listed in the Hookpost agency directory. It can take up to 24 hours to show on the main directory page.`
      ) +
      button('View your listing', url),
  });
}

export function agencyDeclinedEmail(params: { agencyName?: string | null }): RenderedEmail {
  const name = params.agencyName || 'your agency';
  return buildEmail('Update on your Hookpost agency listing', {
    preheader: `We couldn't add ${name} to the directory this time.`,
    kind: 'transactional',
    body:
      heading('About your agency listing') +
      paragraph(
        `Thanks for submitting ${strong(
          escapeHtml(name)
        )}. We aren't able to list it in the Hookpost agency directory right now.`
      ) +
      paragraph(
        "If you think we got this wrong, reply to this email with anything we should look at. A person reads every reply."
      ),
  });
}

/** Internal: goes to ADMIN_NOTIFICATION_EMAIL when an agency signs up. */
export function newAgencyAdminEmail(params: {
  agencyId: string;
  name: string;
  website: string;
  facebook?: string;
  instagram?: string;
  twitter?: string;
  linkedIn?: string;
  youtube?: string;
  tiktok?: string;
  logoPath?: string;
  shortDescription?: string;
  description?: string;
  niches?: string[];
}): RenderedEmail {
  const p = params;
  const socials: Array<[string, string | undefined]> = [
    ['Website', p.website],
    ['Facebook', p.facebook],
    ['Instagram', p.instagram],
    ['X', p.twitter],
    ['LinkedIn', p.linkedIn],
    ['YouTube', p.youtube],
    ['TikTok', p.tiktok],
    ['Logo', p.logoPath],
  ];
  const rows: Array<[string, string]> = [
    ['Name', escapeHtml(p.name)],
    ...socials
      .filter(([, v]) => !!v)
      .map(([k, v]) => [k, link(escapeHtml(v), v as string)] as [string, string]),
    ['Niches', escapeHtml((p.niches || []).join(', '))],
  ];

  return buildEmail('New agency created', {
    preheader: `${p.name} submitted an agency listing for review.`,
    kind: 'transactional',
    reason: 'Internal notification for Hookpost admins.',
    body:
      heading('New agency to review') +
      details(rows) +
      (p.shortDescription ? paragraph(`${strong('Short description:')} ${escapeHtml(p.shortDescription)}`) : '') +
      (p.description ? paragraph(`${strong('Description:')} ${escapeHtml(p.description)}`) : '') +
      button('Approve', `${SITE}/agencies/action/approve/${p.agencyId}`) +
      paragraph(link('Decline this agency', `${SITE}/agencies/action/decline/${p.agencyId}`)),
  });
}
