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

const PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=in.hookstep.hookpost.twa';

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
  trialDays?: number;
}): RenderedEmail {
  const { orgName, billing, channels, period, isTrial, trialDays = 7 } = params;
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
      ]) +
      paragraph('Three steps to your first scheduled post:') +
      steps(
        [
          `${link('Connect your social channels', `${base}/launches`)}.`,
          'Write a post, or let the AI draft one, and pick a time.',
          `Post from your phone with the ${link('Android app', PLAY_STORE_URL)}.`,
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
