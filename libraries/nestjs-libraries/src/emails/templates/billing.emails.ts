import {
  appUrl,
  buildEmail,
  button,
  callout,
  details,
  escapeHtml,
  heading,
  link,
  paragraph,
  RenderedEmail,
  steps,
  strong,
} from '@hookpost/nestjs-libraries/emails/layout/email.layout';

// No Android app link in these emails yet. The Play listing
// (https://play.google.com/store/apps/details?id=in.hookstep.hookpost.twa)
// is public now - HTTP 200 logged out, checked 3 Oct 2026; it was a 404 on
// 29 Sep - so one can be added. The Play app is consumption-only: it hides
// all checkout (apps/frontend/src/components/layout/twa.ts), so an email may
// point people to the app for using Hookpost, never for paying.

/** "STANDARD" -> "Standard" */
export function tierLabel(billing?: string | null): string {
  if (!billing) return '';
  return billing.charAt(0) + billing.slice(1).toLowerCase();
}

/** 599 -> "₹599", 5990 -> "₹5,990", 15 -> "$15" */
export function formatMoney(amount: number, currency?: string | null): string {
  const isUsd = (currency || '').toUpperCase() === 'USD';
  const symbol = isUsd ? '$' : '₹';
  const hasPaise = Math.round(amount * 100) % 100 !== 0;
  const formatted = amount.toLocaleString(isUsd ? 'en-US' : 'en-IN', {
    minimumFractionDigits: hasPaise ? 2 : 0,
    maximumFractionDigits: 2,
  });
  return `${symbol}${formatted}`;
}

/** Razorpay webhook: first charge or trial authentication on a subscription. */
export function subscriptionWelcomeEmail(params: {
  orgName: string;
  billing: string;
  channels: number;
  period: 'MONTHLY' | 'YEARLY' | string;
  isTrial: boolean;
  /** Days until the first charge, from the Razorpay subscription. */
  trialDays?: number;
  /** When the first charge happens; shown so the customer can plan for it. */
  firstChargeAt?: Date;
}): RenderedEmail {
  const { orgName, billing, channels, period, isTrial, trialDays = 7, firstChargeAt } = params;
  const chargeDate = firstChargeAt
    ? firstChargeAt.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'Asia/Kolkata',
      })
    : '';
  const tier = tierLabel(billing);
  const base = appUrl();

  const subject = isTrial
    ? `Your Hookpost ${tier} trial has started`
    : `Welcome to Hookpost ${tier}`;

  return buildEmail(subject, {
    preheader: isTrial
      ? `Your ${trialDays}-day free trial is active. Here's how to get your first post out.`
      : `Your ${tier} plan is active. Here's how to get your first post out.`,
    kind: 'transactional',
    body:
      heading(isTrial ? `Your ${trialDays}-day trial has started` : `You're on Hookpost ${escapeHtml(tier)}`) +
      paragraph(
        `Thanks for choosing Hookpost. ${
          isTrial ? `Your ${trialDays}-day free trial` : `Your ${escapeHtml(tier)} plan`
        } is now active for ${strong(escapeHtml(orgName))}.`
      ) +
      details([
        ['Workspace', escapeHtml(orgName)],
        ['Plan', `${escapeHtml(tier)} &middot; ${channels} channels`],
        ['Billing', period === 'MONTHLY' ? 'Monthly' : 'Yearly'],
        ['Status', isTrial ? `Free trial (${trialDays} days)` : 'Active'],
        ...(isTrial && chargeDate ? ([['First charge', chargeDate]] as Array<[string, string]>) : []),
      ]) +
      paragraph('Three steps to your first scheduled post:') +
      steps(
        [
          `${link('Connect your social channels', `${base}/launches`)}.`,
          'Write a post, or let the AI draft one, and pick a time.',
          `Check or edit what's scheduled from your phone: ${link('Hookpost', `${base}/launches`)} works in any mobile browser.`,
        ],
        { numbered: true }
      ) +
      button('Connect your channels', `${base}/launches`) +
      callout(
        `Need help connecting an account or moving your schedule from Buffer or Hootsuite? Reply to this email. I read every message.<br /><br />${strong(
          'Mohan Bhanushali'
        )}<br /><span style="color:#6B7280;font-size:13px;">Founder, Hookpost</span>`
      ),
  });
}

/** Razorpay webhook: payment.failed, subscription.pending or subscription.halted. */
export function paymentFailedEmail(params: {
  orgName: string;
  billing?: string | null;
  amount?: number;
  currency?: string;
  reason?: string;
  isHalted?: boolean;
}): RenderedEmail {
  const { orgName, billing, amount, currency, reason, isHalted } = params;
  const planName = billing ? `your ${tierLabel(billing)} plan` : 'your subscription';
  const money = amount ? formatMoney(amount, currency) : '';

  const subject = isHalted
    ? 'Action needed: Hookpost renewal paused'
    : "Your Hookpost payment didn't go through";

  const rows: Array<[string, string]> = [
    ['Workspace', escapeHtml(orgName)],
    ['Plan', billing ? escapeHtml(tierLabel(billing)) : 'Subscription renewal'],
  ];
  if (money) rows.push(['Amount', money]);
  rows.push([
    "Bank's reason",
    escapeHtml(reason || 'Authorization declined or UPI mandate pending'),
  ]);

  return buildEmail(subject, {
    preheader: isHalted
      ? 'Your bank declined every retry. Update your payment method to keep posting.'
      : `We couldn't collect ${money || 'your renewal'}. Your posts are still active.`,
    kind: 'transactional',
    body:
      heading(isHalted ? 'Your renewal is paused' : "We couldn't collect your payment") +
      paragraph(
        isHalted
          ? `Your bank declined every retry for ${escapeHtml(planName)}, so the automatic renewal is paused.`
          : `We tried to renew ${escapeHtml(planName)} for ${strong(escapeHtml(orgName))}${
              money ? ` and the payment of ${strong(money)}` : ', and the payment'
            } didn't go through.`
      ) +
      details(rows) +
      paragraph(
        'Your scheduled posts and connected channels are still active right now. To keep them running, approve the mandate in your UPI app or update your payment method.'
      ) +
      button('Update payment method', `${appUrl()}/billing`) +
      paragraph("Stuck on UPI or card details? Reply to this email and we'll help.", {
        muted: true,
        small: true,
      }),
  });
}

/** "30 Sep 2026", in India time like the rest of the billing emails. */
export function formatBillingDate(date: Date): string {
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
}

const FREE_PLAN_LINE =
  'the Free plan (2 channels, 30 posts a month). Your posts and connected accounts stay; channels beyond the first 2 are paused until you subscribe again';

/**
 * Razorpay webhook: subscription.cancelled, whoever cancelled it (the customer
 * from Billing, or us from the Razorpay dashboard).
 *
 * `accessUntil` is the end of the period already paid for (Razorpay's
 * current_end) when the workspace keeps the plan until then. It is null when
 * the plan has already ended: the period ran out, or its payment was refunded.
 */
export function subscriptionCancelledEmail(params: {
  orgName: string;
  billing: string;
  period?: 'MONTHLY' | 'YEARLY' | string | null;
  accessUntil: Date | null;
  endedAt?: Date;
}): RenderedEmail {
  const { orgName, billing, period, accessUntil, endedAt = new Date() } = params;
  const tier = tierLabel(billing);
  const until = accessUntil ? formatBillingDate(accessUntil) : '';

  const rows: Array<[string, string]> = [
    ['Workspace', escapeHtml(orgName)],
    ['Plan', `${escapeHtml(tier)}${period ? ` &middot; ${period === 'YEARLY' ? 'Yearly' : 'Monthly'}` : ''}`],
    accessUntil
      ? ['Paid access until', until]
      : ['Plan ended', formatBillingDate(endedAt)],
    ['Future charges', 'None'],
  ];

  return buildEmail('Your Hookpost plan is cancelled', {
    preheader: accessUntil
      ? `${tier} stays active until ${until}. You won't be charged again.`
      : `Your ${tier} plan has ended. You won't be charged again.`,
    kind: 'transactional',
    body:
      heading('Your plan is cancelled') +
      paragraph(
        `Your Hookpost ${escapeHtml(tier)} plan for ${strong(escapeHtml(orgName))} is cancelled, and you won't be charged again.`
      ) +
      details(rows) +
      paragraph(
        accessUntil
          ? `Everything keeps working as it does now until ${strong(until)}: your channels, scheduled posts and AI credits. After that the workspace moves to ${FREE_PLAN_LINE}.`
          : `The workspace is now on ${FREE_PLAN_LINE}.`
      ) +
      button('Resubscribe', `${appUrl()}/billing`) +
      paragraph(
        "Cancelled by mistake, or is there something we could have done better? Reply to this email; a person reads every reply.",
        { muted: true, small: true }
      ),
  });
}

/**
 * Razorpay webhook: refund.processed (or refund.created when Razorpay already
 * marks the refund processed). One email per refund id.
 *
 * `plan` says what happened to the subscription, so the customer is never left
 * guessing whether a refund also switched their plan off:
 *   - active: the plan continues and renews as normal
 *   - cancelled: the plan is cancelled and access has ended
 *   - none: the payment was not for a plan we can name
 */
export function refundEmail(params: {
  orgName: string;
  /** Major units, e.g. 599 for Rs 599. */
  amount: number;
  currency: string;
  refundId: string;
  paymentId?: string | null;
  refundedAt: Date;
  billing?: string | null;
  plan: 'active' | 'cancelled' | 'none';
  /** Next renewal, when the plan stays active and Razorpay reports one. */
  nextChargeAt?: Date | null;
}): RenderedEmail {
  const { orgName, amount, currency, refundId, paymentId, refundedAt, billing, plan, nextChargeAt } = params;
  const money = formatMoney(amount, currency);
  const tier = billing ? tierLabel(billing) : '';
  const planName = tier ? `${tier} plan` : 'plan';

  const rows: Array<[string, string]> = [
    ['Amount', money],
    ['Refund ID', escapeHtml(refundId)],
  ];
  if (paymentId) rows.push(['Original payment', escapeHtml(paymentId)]);
  rows.push(['Date', formatBillingDate(refundedAt)]);
  if (plan !== 'none') {
    rows.push([
      'Your plan',
      plan === 'active' ? `${escapeHtml(tier || 'Plan')} &middot; still active` : `${escapeHtml(tier || 'Plan')} &middot; cancelled`,
    ]);
  }

  const planLine =
    plan === 'active'
      ? `Your ${escapeHtml(planName)} for ${strong(escapeHtml(orgName))} stays active${
          nextChargeAt ? ` and renews on ${strong(formatBillingDate(nextChargeAt))}` : ''
        }. Nothing else changes.`
      : plan === 'cancelled'
      ? `Your ${escapeHtml(planName)} for ${strong(escapeHtml(orgName))} is cancelled, so you won't be charged again. The workspace is now on ${FREE_PLAN_LINE}.`
      : '';

  return buildEmail(`Your refund of ${money} is on its way`, {
    preheader: `${money} is going back to your original payment method. It usually reaches your bank in 5–7 working days.`,
    kind: 'transactional',
    body:
      heading(`Your refund of ${money} is on its way`) +
      paragraph(
        `We've refunded ${strong(money)} to the payment method you paid with. It usually reaches your bank in 5–7 working days; the exact time depends on your bank.`
      ) +
      details(rows) +
      (planLine ? paragraph(planLine) : '') +
      (plan === 'cancelled' ? button('Resubscribe', `${appUrl()}/billing`) : '') +
      paragraph(
        `Not in your account after 7 working days? Reply with the refund ID above and we'll chase it with Razorpay.`,
        { muted: true, small: true }
      ),
  });
}
