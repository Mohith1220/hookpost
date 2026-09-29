/**
 * Lead nurture drip for free workspaces: day 1, day 3 and day 7 after signup.
 * Sent by scripts/lead-campaign/run-lead-drip.js (cron on the server), which
 * uses an esbuild bundle of this file, so keep imports to import-free modules
 * (the email layout and the pricing table). After changing this file, run
 * scripts/lead-campaign/build-lead-email.sh and commit the regenerated bundle.
 *
 * Prices come from the live pricing table rather than being typed in here, so
 * the email can never quote a price the checkout does not charge.
 */
import {
  buildEmail,
  button,
  details,
  escapeHtml,
  heading,
  paragraph,
  signoff,
  steps,
  strong,
} from '../layout/email.layout';
import { pricingINR, pricingUSD } from '../../database/prisma/subscriptions/pricing';

export interface LeadEmailParams {
  userName?: string | null;
  orgName?: string | null;
  email: string;
  currency: 'INR' | 'USD';
  stage: 'STAGE_1_LAUNCH' | 'STAGE_2_FEATURES' | 'STAGE_3_FOUNDER';
  discountCode?: string;
  appUrl?: string;
}

function money(amount: number, isINR: boolean): string {
  return isINR
    ? `₹${amount.toLocaleString('en-IN')}`
    : `$${amount.toLocaleString('en-US')}`;
}

export function generateLeadEmail(params: LeadEmailParams): {
  subject: string;
  html: string;
  text: string;
} {
  const {
    userName,
    orgName,
    email,
    currency,
    stage,
    discountCode = 'LAUNCH50',
    appUrl = 'https://hookpost.hookstep.in',
  } = params;

  const displayName = userName || (email ? email.split('@')[0] : 'there');
  const isINR = currency === 'INR';
  const standard = (isINR ? pricingINR : pricingUSD).STANDARD;
  const monthly = money(standard.month_price, isINR);
  const yearly = money(standard.year_price, isINR);
  const name = escapeHtml(displayName);
  const code = escapeHtml(discountCode);
  const base = appUrl.replace(/\/+$/, '');
  const unsubscribeUrl = 'mailto:support@hookstep.in?subject=Unsubscribe';

  if (stage === 'STAGE_3_FOUNDER') {
    return buildEmail('Quick question about your Hookpost setup', {
      preheader: 'Personal brand or client accounts? Reply and tell me.',
      kind: 'marketing',
      unsubscribeUrl,
      body:
        paragraph(`Hi ${name},`) +
        paragraph(
          `Mohan here, founder of Hookpost. You signed up a week ago${
            orgName ? ` for ${strong(escapeHtml(orgName))}` : ''
          }, and I wanted to check how setup is going.`
        ) +
        paragraph(
          'Are you posting for your own brand, or managing accounts for clients?'
        ) +
        paragraph(
          'If anything got in the way, like connecting a channel or choosing a plan, reply to this email and tell me. I read and answer every reply myself.'
        ) +
        signoff('Mohan Bhanushali', 'Founder, Hookpost'),
    });
  }

  if (stage === 'STAGE_2_FEATURES') {
    return buildEmail('One post, every channel: how Hookpost works', {
      preheader: 'The calendar, AI drafts and the Claude/Cursor integration, in one minute.',
      kind: 'marketing',
      unsubscribeUrl,
      body:
        heading('One post, every channel') +
        paragraph(`Hi ${name}, here's what most people set up in their first week on Hookpost:`) +
        steps([
          `${strong('Calendar.')} See and drag every scheduled post for LinkedIn, X, Instagram, Facebook and YouTube in one view.`,
          `${strong('AI drafts.')} Turn one idea into a post sized for each platform, with hashtags.`,
          `${strong('Claude and Cursor.')} Schedule posts from your editor through the Hookpost MCP server or CLI.`,
        ]) +
        button('Open your calendar', `${base}/launches`) +
        paragraph(
          `When you're ready to upgrade, Standard is ${monthly}/month and code ${strong(code)} takes 50% off.`,
          { muted: true, small: true }
        ) +
        signoff('The Hookpost team'),
    });
  }

  // STAGE_1_LAUNCH
  return buildEmail(`50% off Hookpost Standard with ${discountCode}`, {
    preheader: `Standard is ${monthly}/month for ${standard.channel} channels. Your code takes 50% off.`,
    kind: 'marketing',
    unsubscribeUrl,
    body:
      heading('Your Hookpost Standard offer') +
      paragraph(`Hi ${name},`) +
      paragraph(
        `Thanks for signing up for Hookpost${
          orgName ? ` for ${strong(escapeHtml(orgName))}` : ''
        }. When you need more than the free plan, Standard covers ${standard.channel} channels and ${standard.posts_per_month} posts a month, and code ${strong(
          code
        )} takes 50% off.`
      ) +
      details([
        ['Standard', `${monthly}/month or ${yearly}/year`],
        ['Channels', `${standard.channel}`],
        ['Scheduled posts', `${standard.posts_per_month} a month`],
        ['AI captions', `${standard.ai_generation_count} a month`],
        ['Your code', `${code} (50% off)`],
      ]) +
      button('See plans', `${base}/billing`) +
      paragraph(
        'Need a plan for a team or several client brands? Reply to this email and we\'ll help you pick.',
        { muted: true, small: true }
      ) +
      signoff('The Hookpost team'),
  });
}
