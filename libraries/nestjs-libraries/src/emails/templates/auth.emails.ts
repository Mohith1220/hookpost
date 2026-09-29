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

/**
 * Security notice when an admin changes sign-in emails. Sent to every address
 * involved, old and new, so the previous owner of an address always hears
 * about it. `changes` lists each account's old -> new address; the admin tool
 * swaps two accounts, so it is usually two rows (a -> b and b -> a).
 */
export function loginChangedEmail(params: {
  changes: Array<{ from: string; to: string }>;
  recipient: string;
}): RenderedEmail {
  const { changes, recipient } = params;
  const mine = changes.find((c) => c.from.toLowerCase() === recipient.toLowerCase());
  const swap = changes.length > 1;
  const rows: Array<[string, string]> = changes.map((c) => [
    `Signed in with ${escapeHtml(c.from)}`,
    `now signs in with ${escapeHtml(c.to)}`,
  ]);

  return buildEmail('Your Hookpost sign-in email changed', {
    preheader: mine
      ? `Your account no longer signs in with ${mine.from}. It now uses ${mine.to}.`
      : `An administrator changed which account ${recipient} signs in to.`,
    kind: 'transactional',
    reason: `You received this security notice because ${recipient} was one of the addresses involved.`,
    body:
      heading('Your sign-in email changed') +
      paragraph(
        swap
          ? `An administrator swapped the sign-in emails of two Hookpost accounts. ${strong(
              escapeHtml(recipient)
            )} was one of them, so we're telling both the old and the new address.`
          : `An administrator changed the sign-in email on your Hookpost account. We're telling both the old and the new address.`
      ) +
      details(rows) +
      paragraph(
        'Each account keeps its own workspaces, plan and subscription; only the sign-in address moved. If you meant to cancel a subscription, do that separately from Billing.'
      ) +
      button('Sign in', `${appUrl()}/auth/login`) +
      paragraph("Didn't expect this? Reply to this email straight away and we'll look into it.", {
        muted: true,
        small: true,
      }),
  });
}
