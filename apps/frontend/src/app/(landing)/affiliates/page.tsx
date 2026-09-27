import Link from 'next/link';
import { Metadata } from 'next';
import { SiteNav } from '../site-nav';
import { pricingINR } from '@hookpost/nestjs-libraries/database/prisma/subscriptions/pricing';

// Public terms for the affiliate programme. The numbers here are the defaults
// on the Affiliate table (commissionPercent 30, commissionMonths 12) and the
// cookie window in components/affiliates/ref-capture.tsx - change them together.
const CANONICAL = 'https://hookpost.hookstep.in/affiliates';
const PERCENT = 30;
const MONTHS = 12;
const COOKIE_DAYS = 60;
const MIN_PAYOUT = 1000;
// AFFILIATE_COUPON_PERCENT in affiliate.service.ts.
const COUPON_PERCENT = 10;
const { STANDARD, PRO } = pricingINR;
const perYear = (monthly: number) =>
  Math.round(monthly * (PERCENT / 100) * MONTHS).toLocaleString('en-IN');

const FAQ = [
  {
    q: 'How much does the Hookpost affiliate programme pay?',
    a: `${PERCENT}% of every payment a customer you refer makes during their first ${MONTHS} months. A customer on Standard (₹${STANDARD.month_price} a month) earns you about ₹${perYear(STANDARD.month_price)} over the year; one on Pro (₹${PRO.month_price} a month) about ₹${perYear(PRO.month_price)}.`,
  },
  {
    q: 'How long does the referral cookie last?',
    a: `${COOKIE_DAYS} days. If someone clicks your link and creates their Hookpost account within ${COOKIE_DAYS} days, they are yours. If they click several affiliates' links, the last click counts.`,
  },
  {
    q: 'Do the people I refer get a discount?',
    a: `Yes. Your affiliate code is also a coupon: it gives them ${COUPON_PERCENT}% off any paid plan, for as long as they stay subscribed. It is applied automatically when they arrive on your link, and anyone who types it at checkout is credited to you even without the link.`,
  },
  {
    q: 'When and how do I get paid?',
    a: `Once a month, by UPI or bank transfer in India (PayPal outside India), as soon as what you are owed passes ₹${MIN_PAYOUT.toLocaleString('en-IN')}. A commission is held for 30 days after the payment so refunds can be reversed first.`,
  },
  {
    q: 'Who can join?',
    a: 'Anyone with a Hookpost account, including the free plan. You get your link instantly on the Earn 30% page inside the app. There is no application form.',
  },
  {
    q: 'What is not allowed?',
    a: 'Referring yourself or your own workspaces, bidding on "Hookpost" or its misspellings in search ads, spam (unsolicited email, DMs or comment spam), and coupon or cashback sites. Commissions earned this way are voided and the link is paused.',
  },
];

export const metadata: Metadata = {
  title: `Hookpost Affiliate Programme: Earn ${PERCENT}% Recurring`,
  description: `Earn ${PERCENT}% of every payment for ${MONTHS} months when people you refer subscribe to Hookpost. ${COOKIE_DAYS}-day cookie, paid monthly by UPI or bank transfer.`,
  alternates: { canonical: CANONICAL },
  openGraph: {
    title: `Hookpost affiliate programme - ${PERCENT}% recurring for ${MONTHS} months`,
    description: `Share Hookpost, earn ${PERCENT}% of every payment for a year. ${COOKIE_DAYS}-day cookie, UPI payouts.`,
    url: CANONICAL,
    siteName: 'Hookpost',
    type: 'website',
    images: [
      {
        url: 'https://hookpost.hookstep.in/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Hookpost affiliate programme',
      },
    ],
  },
};

export default function AffiliatesPage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'FAQPage',
        mainEntity: FAQ.map((f) => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://hookpost.hookstep.in/' },
          { '@type': 'ListItem', position: 2, name: 'Affiliates', item: CANONICAL },
        ],
      },
    ],
  };

  return (
    <div className="min-h-screen bg-black text-white font-dm selection:bg-[#FF4CE2] selection:text-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <SiteNav />

      <div>
        <section className="mx-auto w-full max-w-[1100px] px-5 pt-16 sm:px-10">
          <p className="text-sm font-semibold uppercase tracking-wider text-[#FF4CE2]">Affiliate programme</p>
          <h1 className="mt-3 text-4xl font-extrabold tracking-tight font-jakarta sm:text-5xl text-balance">
            Earn {PERCENT}% recurring for every customer you send
          </h1>
          <p className="mt-5 max-w-[65ch] text-lg text-white/70">
            Recommend Hookpost to creators, agencies and developers. When someone signs up through your link and pays,
            you get {PERCENT}% of every payment they make for their first {MONTHS} months, paid out monthly by UPI or
            bank transfer.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/auth/register"
              prefetch={false}
              className="inline-flex h-12 items-center rounded-xl bg-[#FF4CE2] px-6 font-bold text-white"
            >
              Get your affiliate link
            </Link>
            <Link
              href="/affiliate"
              prefetch={false}
              className="inline-flex h-12 items-center rounded-xl border border-white/20 px-6 font-semibold text-white/90 hover:border-[#FF4CE2]/60"
            >
              Already a user? Open your dashboard
            </Link>
          </div>
        </section>

        <section className="mx-auto w-full max-w-[1100px] px-5 py-14 sm:px-10" aria-labelledby="numbers">
          <h2 id="numbers" className="sr-only">Programme terms at a glance</h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              [`${PERCENT}%`, `of every payment, for ${MONTHS} months`],
              [`₹${perYear(STANDARD.month_price)}`, `per Standard customer per year`],
              [`${COUPON_PERCENT}% off`, 'for your audience, with your code'],
              [`₹${MIN_PAYOUT.toLocaleString('en-IN')}`, 'minimum payout, sent monthly'],
            ].map(([big, small]) => (
              <li key={small} className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                <div className="text-3xl font-extrabold font-jakarta text-[#FF4CE2]">{big}</div>
                <div className="mt-2 text-white/70">{small}</div>
              </li>
            ))}
          </ul>
        </section>

        <section className="border-t border-white/10">
          <div className="mx-auto w-full max-w-[1100px] px-5 py-14 sm:px-10">
            <h2 className="text-2xl font-extrabold tracking-tight font-jakarta">How it works</h2>
            <ol className="mt-6 grid gap-4 sm:grid-cols-3">
              {[
                ['Get your link', 'Create a free Hookpost account and open Earn 30% in the sidebar. Your link is ready instantly.'],
                ['Share it', 'In a video, a newsletter, a blog post or a tweet thread. Add ?ref=yourcode to any Hookpost page, such as a comparison or guide.'],
                ['Get paid', `Every time someone you referred is charged, ${PERCENT}% lands in your dashboard. We pay out monthly.`],
              ].map(([t, d], i) => (
                <li key={t} className="rounded-2xl border border-white/10 p-6">
                  <div className="text-sm font-bold text-[#FF4CE2]">Step {i + 1}</div>
                  <h3 className="mt-1 text-lg font-bold font-jakarta">{t}</h3>
                  <p className="mt-2 text-white/70">{d}</p>
                </li>
              ))}
            </ol>
            <p className="mt-8 max-w-[70ch] text-white/60">
              Good pages to link to: the{' '}
              <Link href="/free-social-media-scheduler" className="text-[#FF4CE2] underline">free plan</Link>,{' '}
              <Link href="/social-media-scheduler-india" className="text-[#FF4CE2] underline">India pricing in rupees</Link>,{' '}
              <Link href="/compare" className="text-[#FF4CE2] underline">comparisons</Link> and the{' '}
              <Link href="/mcp" className="text-[#FF4CE2] underline">MCP server for AI agents</Link>.
            </p>
          </div>
        </section>

        <section className="border-t border-white/10 bg-white/[0.015]">
          <div className="mx-auto w-full max-w-[1100px] px-5 py-14 sm:px-10">
            <h2 className="text-2xl font-extrabold tracking-tight font-jakarta">Questions</h2>
            <dl className="mt-6 flex flex-col gap-6">
              {FAQ.map((f) => (
                <div key={f.q}>
                  <dt className="text-lg font-bold font-jakarta">{f.q}</dt>
                  <dd className="mt-2 max-w-[70ch] text-white/70">{f.a}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-10 text-sm text-white/50">
              Questions about a payout? Write to{' '}
              <a href="mailto:support@hookstep.in" className="underline">support@hookstep.in</a>. We may change these
              terms with 30 days' notice; commissions already earned are paid on the terms they were earned under.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
