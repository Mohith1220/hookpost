import {
  appUrl,
  buildEmail,
  button,
  details,
  escapeHtml,
  heading,
  linkFallback,
  paragraph,
  RenderedEmail,
  strong,
} from '@hookpost/nestjs-libraries/emails/layout/email.layout';

/** Sent on sign-up with email + password, and when activation is re-sent. */
export function activationEmail(params: { activationUrl: string }): RenderedEmail {
  const { activationUrl } = params;
  return buildEmail('Confirm your email for Hookpost', {
    preheader: 'One click and your Hookpost account is ready to use.',
    kind: 'transactional',
    body:
      heading('Confirm your email') +
      paragraph(
        'Thanks for signing up for Hookpost. Confirm this is your email address and your account is ready to use.'
      ) +
      button('Confirm email', activationUrl) +
      linkFallback(activationUrl) +
      paragraph(
        "Didn't sign up? You can ignore this email. The account stays inactive until the link is used.",
        { muted: true, small: true }
      ),
  });
}

/** Sent from "Forgot password". The link is a 20-minute token. */
export function passwordResetEmail(params: {
  resetUrl: string;
  expiresInMinutes?: number;
}): RenderedEmail {
  const { resetUrl, expiresInMinutes = 20 } = params;
  return buildEmail('Reset your Hookpost password', {
    preheader: `This link works for ${expiresInMinutes} minutes.`,
    kind: 'transactional',
    body:
      heading('Reset your password') +
      paragraph(
        `We got a request to reset the password on your Hookpost account. The link below works for ${strong(
          `${expiresInMinutes} minutes`
        )}.`
      ) +
      button('Reset password', resetUrl) +
      linkFallback(resetUrl) +
      paragraph(
        "Didn't ask for this? Ignore this email and your password stays the same.",
        { muted: true, small: true }
      ),
  });
}

/** Sent when someone invites a person to their workspace by email. */
export function teamInviteEmail(params: {
  inviterName?: string | null;
  inviterEmail: string;
  orgName: string;
  inviteUrl: string;
  expiresInDays?: number;
}): RenderedEmail {
  const { inviterName, inviterEmail, orgName, inviteUrl, expiresInDays = 2 } = params;
  const who = inviterName || inviterEmail;
  const whoHtml = inviterName
    ? `${strong(escapeHtml(inviterName))} (${escapeHtml(inviterEmail)})`
    : strong(escapeHtml(inviterEmail));

  return buildEmail(`${who} invited you to join "${orgName}"`, {
    preheader: `Join the ${orgName} workspace on Hookpost. The invite expires in ${expiresInDays} days.`,
    kind: 'transactional',
    reason: `You received this email because ${who} invited you to a Hookpost workspace.`,
    body:
      heading(`Join ${escapeHtml(orgName)} on Hookpost`) +
      paragraph(
        `${whoHtml} has invited you to the ${strong(
          escapeHtml(orgName)
        )} workspace, where the team plans and schedules its social posts.`
      ) +
      button('Accept invitation', inviteUrl) +
      linkFallback(inviteUrl) +
      paragraph(
        `This invitation expires in ${expiresInDays} days. Not expecting it? You can ignore this email.`,
        { muted: true, small: true }
      ),
  });
}

/** Sent to both accounts when an admin swaps their sign-in emails. */
export function loginChangedEmail(params: { email: string }): RenderedEmail {
  const { email } = params;
  return buildEmail('Your Hookpost sign-in email changed', {
    preheader: `From now on, sign in with ${email}.`,
    kind: 'transactional',
    body:
      heading('Your sign-in email changed') +
      paragraph('An administrator changed the sign-in email on your Hookpost account.') +
      details([['Sign in with', escapeHtml(email)]]) +
      paragraph(
        'Your plan and subscription did not change. If you meant to cancel a subscription, do that separately from Billing.'
      ) +
      button('Sign in', `${appUrl()}/auth/login`) +
      paragraph("Didn't expect this? Reply to this email and we'll look into it.", {
        muted: true,
        small: true,
      }),
  });
}
