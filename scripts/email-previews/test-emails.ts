/**
 * Checks on the email fixes from the ops/support-and-uptime audit.
 *   node_modules/.bin/esbuild scripts/email-previews/test-emails.ts --bundle --platform=node \
 *     --outfile=/tmp/test-emails.js && node /tmp/test-emails.js
 * Sends nothing.
 */
import { loginChangedEmail } from '@hookpost/nestjs-libraries/emails/templates/auth.emails';
import { agencyListedEmail } from '@hookpost/nestjs-libraries/emails/templates/agency.emails';
import { subscriptionWelcomeEmail } from '@hookpost/nestjs-libraries/emails/templates/billing.emails';
import {
  supportAutoReplyEmail,
  supportInternalEmail,
  supportReplyEmail,
  supportSubject,
  supportTicketRef,
} from '@hookpost/nestjs-libraries/emails/templates/support.emails';

let failed = 0;
function check(ok: boolean, msg: string) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`);
  if (!ok) failed++;
}

// 1. Sign-in email changed: the notice names the OLD address and its new one.
const changes = [
  { from: 'a@example.com', to: 'b@example.com' },
  { from: 'b@example.com', to: 'a@example.com' },
];
const toOld = loginChangedEmail({ changes, recipient: 'a@example.com' });
check(toOld.text.includes('Signed in with a@example.com') && toOld.text.includes('now signs in with b@example.com'), 'login changed: old address is told where its account went');
check(/no longer signs in with a@example.com/.test(toOld.html), 'login changed: preheader names the old address');
check(toOld.text.includes('old and the new address'), 'login changed: says both addresses are notified');

// 2/3. Agency: no review step, no timing claim, no dead directory link.
const listed = agencyListedEmail({ agencyName: 'Bombay Pixel Studio' });
check(!/24 hours|approve|decline|review/i.test(listed.subject + listed.text.replace('no review step', '')), 'agency listed: no approval wording or 24h claim');
check(!/\/agencies\//.test(listed.html), 'agency listed: no link to a directory page that needs login');

// 4. Welcome: real trial length and first charge date; no dead Play Store link.
const trial = subscriptionWelcomeEmail({
  orgName: 'X', billing: 'STANDARD', channels: 5, period: 'MONTHLY', isTrial: true,
  trialDays: 37, firstChargeAt: new Date('2026-11-05T06:00:00Z'),
});
check(trial.text.includes('37-day') && trial.text.includes('First charge: 5 Nov 2026'), 'welcome: trial days and first charge come from the subscription');
check(!/play\.google\.com/.test(trial.html), 'welcome: no link to the unpublished Play Store listing');

// Support tickets.
const ref = supportTicketRef('0b7c1a4e-1111-4222-8333-944455556666');
check(/^HP-[0-9A-HJKMNP-TV-Z]{4}$/.test(ref), `ticket ref format (${ref})`);
check(ref === supportTicketRef('0b7c1a4e-1111-4222-8333-944455556666'), 'ticket ref is stable for an id');
check(supportTicketRef('x', 0) !== supportTicketRef('x', 1), 'ticket ref salt gives another ref on collision');
const auto = supportAutoReplyEmail({ ref, name: 'Priya', topic: 'Billing' });
check(auto.subject === supportSubject(ref, 'Billing') && auto.subject.includes(`[${ref}]`), 'auto-reply subject carries the ref');
check(!/within|hours|business day|working day|24/i.test(auto.text), 'auto-reply promises no SLA');
check(/a person/i.test(auto.text), 'auto-reply says a person replies');
const reply = supportReplyEmail({ ref, topic: 'Billing', name: 'Priya', reply: 'Done <b>now</b>', originalMessage: 'hi' });
check(reply.subject === `Re: ${auto.subject}`, 'admin reply threads with the auto-reply');
check(reply.html.includes('Done &lt;b&gt;now&lt;/b&gt;'), 'admin reply is escaped');
const internal = supportInternalEmail({ ref, name: 'Priya', email: 'p@x.in', topic: 'Billing', message: 'm', adminUrl: 'u' });
check(internal.subject.startsWith(`[${ref}]`), 'internal email subject starts with the ref');

for (const e of [toOld, listed, trial, auto, reply]) {
  check(e.html.includes('Hookpost by Hookstep · Ghatkopar, Mumbai, India') && !/Hookstep/.test(e.html), `footer ok (${e.subject})`);
}

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nall passed');
