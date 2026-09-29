import { createHash } from 'crypto';
import {
  buildEmail,
  callout,
  details,
  escapeHtml,
  heading,
  paragraph,
  RenderedEmail,
  strong,
} from '@hookpost/nestjs-libraries/emails/layout/email.layout';

// Crockford base32 without I, L, O, U: nothing a customer can misread.
const REF_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * "HP-7K2Q": the short ticket reference for a contact message. Derived from
 * the row id so it is stable; `salt` gives a different ref for the rare
 * collision (the column is unique).
 */
export function supportTicketRef(id: string, salt = 0): string {
  const bytes = createHash('sha256').update(`${id}:${salt}`).digest();
  let ref = '';
  for (let i = 0; i < 4; i++) ref += REF_ALPHABET[bytes[i] % 32];
  return `HP-${ref}`;
}

/** Keeps the ref in every subject so the customer's mail client threads them. */
export function supportSubject(ref: string, topic?: string | null): string {
  return `${topic ? `${topic}: ` : ''}your message to Hookpost [${ref}]`;
}

function quoted(message: string): string {
  const trimmed = message.length > 1500 ? `${message.slice(0, 1500)}…` : message;
  return callout(escapeHtml(trimmed).replace(/\n/g, '<br />'));
}

/**
 * To the customer, right after the contact form is sent. It goes to an address
 * nobody has verified, so it carries no text the sender wrote beyond a
 * letters-only first name (the caller checks it): no copy of the message.
 */
export function supportAutoReplyEmail(params: {
  ref: string;
  name?: string | null;
  topic?: string | null;
}): RenderedEmail {
  const { ref, name, topic } = params;
  const first = (name || '').trim().split(/\s+/)[0];
  return buildEmail(supportSubject(ref, topic), {
    preheader: `Your reference is ${ref}. A person will reply to this address.`,
    kind: 'transactional',
    reason: 'You received this email because you wrote to Hookpost support.',
    body:
      heading('We got your message') +
      paragraph(
        `${first ? `Hi ${escapeHtml(first)}, thanks` : 'Thanks'} for writing to Hookpost. This is an automatic confirmation that your message reached us.`
      ) +
      details([
        ['Reference', strong(escapeHtml(ref))],
        ...(topic ? ([['Topic', escapeHtml(topic)]] as Array<[string, string]>) : []),
      ]) +
      paragraph(
        'A person on the team reads every message and will reply to this email address. If you have more to add, reply to this email and keep the reference in the subject.'
      ) +
      paragraph("Didn't write to us? Someone may have typed your address by mistake. You can ignore this email.", {
        muted: true,
        small: true,
      }),
  });
}

/** An admin's reply from /admin/contact, emailed to the customer. */
export function supportReplyEmail(params: {
  ref: string;
  topic?: string | null;
  name?: string | null;
  reply: string;
  originalMessage: string;
}): RenderedEmail {
  const { ref, topic, name, reply, originalMessage } = params;
  const first = (name || '').trim().split(/\s+/)[0];
  return buildEmail(`Re: ${supportSubject(ref, topic)}`, {
    preheader: reply.replace(/\s+/g, ' ').slice(0, 120),
    kind: 'transactional',
    reason: 'You received this email because you wrote to Hookpost support.',
    body:
      paragraph(first ? `Hi ${escapeHtml(first)},` : 'Hi,') +
      paragraph(escapeHtml(reply).replace(/\n/g, '<br />')) +
      paragraph('The Hookpost team', { muted: true }) +
      paragraph(
        `Reply to this email to continue. Your reference is ${strong(escapeHtml(ref))}.`,
        { muted: true, small: true }
      ) +
      paragraph('Your original message:', { muted: true, small: true }) +
      quoted(originalMessage),
  });
}

/** Internal copy to support@. Plain text, so it reads well in any inbox. */
export function supportInternalEmail(params: {
  ref: string;
  name?: string | null;
  email: string;
  topic: string;
  message: string;
  adminUrl: string;
}): { subject: string; text: string } {
  const { ref, name, email, topic, message, adminUrl } = params;
  return {
    subject: `[${ref}] [${topic}] ${name || email}`,
    text:
      `Ticket: ${ref}\n` +
      `From:   ${name || '(no name)'} <${email}>\n` +
      `Topic:  ${topic}\n` +
      `Reply:  ${adminUrl}\n\n${message}\n`,
  };
}
