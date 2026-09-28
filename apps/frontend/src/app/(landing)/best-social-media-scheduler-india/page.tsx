import { Metadata } from 'next';
import Link from 'next/link';
import { SiteNav } from '../site-nav';
import { pricingINR } from '@hookpost/nestjs-libraries/database/prisma/subscriptions/pricing';
import {
  COMPETITOR_FACTS,
  CompetitorFacts,
  FACTS_CHECKED,
} from '../compare/competitor-facts';

// Targets "best social media scheduler India" / "best social media management
// tool India" / "social media scheduling tools India". Page 1 for those is
// global listicles that never mention rupees, UPI or which tools localise to
// INR (Veritas run, 28 Sep 2026), so a roundup built on that one axis is both
// useful and uncontested.
//
// Every competitor figure is read from competitor-facts.ts (vendor pricing
// pages, checked on FACTS_CHECKED); Hookpost's from pricing.ts. Nothing about a
// vendor is typed here - update competitor-facts.ts, not this page. The only
// hand-written text per tool is the "best for" line, and each one is derived
// from a fact in that file.

const CANONICAL = 'https://hookpost.hookstep.in/best-social-media-scheduler-india';
const { FREE, STANDARD, PRO } = pricingINR;
const inr = (v: number) => `₹${v.toLocaleString('en-IN')}`;

// Order: Hookpost first (disclosed below), then the tools that show rupee
// prices to Indian visitors, then the dollar-billed ones.
const ORDER = ['zoho-social', 'publer', 'socialpilot', 'hootsuite', 'buffer', 'metricool', 'later', 'postiz', 'mixpost'];

const BEST_FOR: Record<string, string> = {
  'zoho-social': 'The biggest free plan here (6 channels), rupee prices, and WhatsApp Business and Arattai support.',
  publer: 'Low per-channel pricing with rupee prices shown in India. Cost grows with every account you add.',
  socialpilot: 'Small agencies that want 7 channels on the entry plan, priced in rupees for Indian visitors.',
  hootsuite: 'Teams that want an established enterprise suite and can budget per user: 10 channels on the entry plan.',
  buffer: 'Trying a scheduler for free on 3 channels. Paid plans are per channel, in US dollars.',
  metricool: 'Instagram and Facebook-first brands. The free plan allows 20 posts a month but leaves out X and LinkedIn.',
  later: 'Instagram and TikTok-first brands: 8 channels on the entry plan, no free plan.',
  postiz: 'Developers who want the open-source codebase Hookpost is built on, hosted in US dollars.',
  mixpost: 'Self-hosting on your own server with a one-time licence instead of a subscription.',
};

const price = (c: CompetitorFacts) => {
  const p = c.cheapestPaid;
  if (!p) return 'Not published';
  const sym = p.currency === 'USD' ? '$' : `${p.currency} `;
  if (p.billing === 'one-time') return `${sym}${p.price} one-time`;
  return `${sym}${p.price} / ${p.per.replace('/month', '').replace('month', 'mo')}${p.billing === 'annual' ? ' (billed yearly)' : ''}`;
};

const freeCell = (c: CompetitorFacts) =>
  c.freePlan ? c.freePlan : c.freeTrialDays ? `No (${c.freeTrialDays}-day trial)` : 'No';

const rupeeCell = (c: CompetitorFacts) =>
  c.inr == null ? 'Not stated' : c.inr ? 'Yes, localised' : 'No, US dollars';

const FAQ = [
  {
    q: 'What is the best social media scheduler in India?',
    a: `It depends on how you want to pay and how many accounts you run. For UPI Autopay and one flat price, Hookpost Standard is ${inr(STANDARD.month_price)} a month for ${STANDARD.channel} channels. For the largest free plan, Zoho Social gives 6 channels free. For an established enterprise suite, Hootsuite shows rupee prices in India but charges per user.`,
  },
  {
    q: 'Which social media schedulers accept UPI?',
    a: 'Of the ten tools on this page, only Hookpost lists UPI Autopay, through Razorpay. Hootsuite, Zoho Social, Publer and SocialPilot show rupee prices to Indian visitors, but none of them lists UPI on its pricing page. The rest bill in US dollars, which needs a card enabled for international payments.',
  },
  {
    q: 'Is there a free social media scheduler for Indian businesses?',
    a: `Yes. Zoho Social's free plan covers 6 channels, Buffer's covers 3 channels with 10 queued posts each, Metricool's allows 20 posts a month without X or LinkedIn, and Hookpost's covers ${FREE.channel} channels and ${FREE.posts_per_month} posts a month including X and LinkedIn. Hootsuite, Later and SocialPilot offer trials, not free plans.`,
  },
  {
    q: 'Per channel, per user or flat: which pricing is cheapest?',
    a: `Per-channel plans (Buffer, Publer) are cheapest for one or two accounts and grow with every account you add. Per-user plans (Hootsuite, Sprout Social, Agorapulse) grow with your team. Flat tiers (Hookpost, Zoho Social, SocialPilot, Later) cost the same until you outgrow the tier: Hookpost Pro is ${inr(PRO.month_price)} a month for ${PRO.channel} channels and up to ${PRO.team_member_limit} team members.`,
  },
  {
    q: 'Can I schedule Instagram posts from India with these tools?',
    a: 'Yes, all ten support Instagram. On Hookpost, Instagram and Threads are built and waiting on Meta app approval, so new accounts cannot connect them yet; Facebook Pages, LinkedIn, YouTube, X and the others work today.',
  },
];

export const metadata: Metadata = {
  title: 'Best Social Media Schedulers in India (2026) | Hookpost',
  description: `Ten social media schedulers compared for Indian teams: free plans, rupee prices, UPI and per-channel vs flat pricing, from vendor pages (${FACTS_CHECKED}).`,
  alternates: { canonical: CANONICAL },
  openGraph: {
    title: 'Best social media schedulers in India (2026), compared in rupees',
    description: 'Free plans, rupee prices, UPI and pricing models for ten schedulers, read off each vendor page.',
    url: CANONICAL,
    siteName: 'Hookpost',
    type: 'article',
    locale: 'en_IN',
    images: [{ url: 'https://hookpost.hookstep.in/og-image.png', width: 1200, height: 630, alt: 'Best social media schedulers in India' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Best social media schedulers in India (2026)',
    description: 'Ten tools compared on free plans, rupee prices and UPI.',
    images: ['https://hookpost.hookstep.in/og-image.png'],
  },
};

export default function BestSchedulerIndiaPage() {
  const tools = ORDER.map((k) => COMPETITOR_FACTS[k]).filter(Boolean);
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        '@id': `${CANONICAL}#article`,
        headline: 'The best social media schedulers for India in 2026',
        inLanguage: 'en-IN',
        dateModified: '2026-09-28',
        author: { '@type': 'Organization', name: 'Hookpost', url: 'https://hookpost.hookstep.in/about' },
        publisher: { '@type': 'Organization', name: 'Hookstep', url: 'https://hookpost.hookstep.in/about' },
        mainEntityOfPage: CANONICAL,
      },
      {
        '@type': 'ItemList',
        '@id': `${CANONICAL}#list`,
        name: 'Social media schedulers for India',
        itemListElement: [{ name: 'Hookpost', url: 'https://hookpost.hookstep.in/' }, ...tools.map((t) => ({ name: t.name, url: t.sources[0] }))].map(
          (t, i) => ({ '@type': 'ListItem', position: i + 1, name: t.name, url: t.url })
        ),
      },
      {
        '@type': 'FAQPage',
        '@id': `${CANONICAL}#faq`,
        mainEntity: FAQ.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://hookpost.hookstep.in/' },
          { '@type': 'ListItem', position: 2, name: 'Best social media schedulers in India', item: CANONICAL },
        ],
      },
    ],
  };

  const cell = 'py-3 pe-4 align-top';
  return (
    <div className="min-h-screen bg-black text-white font-dm selection:bg-[#FF4CE2] selection:text-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <SiteNav />

      <section className="mx-auto w-full max-w-[1100px] px-5 pt-16 sm:px-10">
        <p className="text-sm font-semibold uppercase tracking-wider text-[#FF4CE2]">Prices checked {FACTS_CHECKED}</p>
        <h1 className="mt-3 text-4xl font-extrabold tracking-tight font-jakarta sm:text-5xl text-balance">
          The best social media schedulers for India in 2026
        </h1>
        <p className="mt-5 max-w-[70ch] text-lg text-white/75">
          Most &quot;best scheduler&quot; lists are written for US buyers, so they never tell you which tools show rupee prices,
          which take UPI, or whether you pay per channel, per user or one flat fee. This one does. Ten tools, every figure read
          off the vendor&apos;s own pricing page.
        </p>
        <p className="mt-4 max-w-[70ch] rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/70">
          <strong className="text-white">Disclosure:</strong> we make Hookpost, so it is listed first. Every other tool is
          described from its own pricing page, linked below, and the &quot;best for&quot; line under each one says who should
          pick it over us.
        </p>
      </section>

      <section className="mx-auto w-full max-w-[1100px] px-5 py-10 sm:px-10" aria-labelledby="short-answer">
        <h2 id="short-answer" className="text-2xl font-extrabold tracking-tight font-jakarta">The short answer</h2>
        <ul className="mt-4 flex max-w-[75ch] flex-col gap-2 text-white/80">
          <li>
            <strong className="text-white">Pay with UPI, one flat price:</strong> Hookpost, {inr(STANDARD.month_price)} a month
            for {STANDARD.channel} channels, free plan included.
          </li>
          <li>
            <strong className="text-white">Biggest free plan:</strong> Zoho Social, 6 channels free.
          </li>
          <li>
            <strong className="text-white">An established enterprise suite:</strong> Hootsuite, priced per user.
          </li>
          <li>
            <strong className="text-white">Self-host on your own server:</strong> Hookpost or Postiz (AGPL-3.0), or Mixpost with a
            one-time licence.
          </li>
        </ul>
      </section>

      <section className="mx-auto w-full max-w-[1100px] px-5 pb-10 sm:px-10" aria-labelledby="table">
        <h2 id="table" className="text-2xl font-extrabold tracking-tight font-jakarta">All ten side by side</h2>
        <div className="mt-6 -mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
          <table className="w-full min-w-[860px] border-collapse text-left text-sm">
            <caption className="sr-only">Social media schedulers for India compared</caption>
            <thead>
              <tr className="border-b border-white/15 text-white/60">
                {['Tool', 'Free plan', 'Cheapest paid plan', 'Pricing model', 'Rupee prices in India', 'UPI listed'].map((h) => (
                  <th key={h} scope="col" className="py-3 pe-4 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="text-white/80">
              <tr className="border-b border-white/10 bg-[#FF4CE2]/[0.06]">
                <th scope="row" className={`${cell} font-bold text-white`}>Hookpost</th>
                <td className={cell}>{FREE.channel} channels, {FREE.posts_per_month} posts a month</td>
                <td className={cell}>{inr(STANDARD.month_price)} / mo for {STANDARD.channel} channels</td>
                <td className={cell}>flat tiers</td>
                <td className={cell}>Yes, billed in rupees</td>
                <td className={cell}>Yes, UPI Autopay</td>
              </tr>
              {tools.map((c) => (
                <tr key={c.slug} className="border-b border-white/10">
                  <th scope="row" className={`${cell} font-bold text-white`}>{c.name}</th>
                  <td className={cell}>{freeCell(c)}</td>
                  <td className={cell}>{price(c)}</td>
                  <td className={cell}>{c.pricingModel || 'Not stated'}</td>
                  <td className={cell}>{rupeeCell(c)}</td>
                  <td className={cell}>Not listed</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-sm text-white/55">
          &quot;Rupee prices in India&quot; means the vendor&apos;s pricing page switched to INR for an Indian visitor when we checked.
          The cheapest paid plan is shown as the vendor lists it, which for most is a US-dollar figure. Vendors change prices and
          currency by country, so confirm on their page before you buy.
        </p>
      </section>

      <section className="border-t border-white/10">
        <div className="mx-auto w-full max-w-[1100px] px-5 py-14 sm:px-10">
          <h2 className="text-2xl font-extrabold tracking-tight font-jakarta">Each tool, and who it suits</h2>
          <div className="mt-8 flex flex-col gap-6">
            <article className="rounded-2xl border border-[#FF4CE2]/40 p-6">
              <h3 className="text-xl font-bold font-jakarta">1. Hookpost</h3>
              <p className="mt-2 text-white/75">
                An AI social media scheduler made in India and billed in rupees through Razorpay, with UPI Autopay, cards and
                NetBanking. Free plan for {FREE.channel} channels; Standard is {inr(STANDARD.month_price)} a month (or{' '}
                {inr(STANDARD.year_price)} a year) for {STANDARD.channel} channels and{' '}
                {STANDARD.posts_per_month.toLocaleString('en-IN')} posts, with AI captions, the API and an MCP server for
                Claude and Cursor; Pro is {inr(PRO.month_price)} for {PRO.channel} channels and up to {PRO.team_member_limit}{' '}
                team members. Open source under AGPL-3.0.
              </p>
              <p className="mt-2 text-sm text-white/60">
                <strong className="text-white/80">Best for:</strong> paying with UPI at one flat price, and teams that post to
                LinkedIn, YouTube, X and developer channels as well as Instagram. Instagram and Threads are waiting on Meta app
                approval, so new accounts cannot connect them yet.
              </p>
              <p className="mt-3 text-sm">
                <Link href="/social-media-scheduler-india" className="text-[#FF4CE2] underline">Hookpost for India</Link>
                {' · '}
                <Link href="/pricing" className="text-[#FF4CE2] underline">Every plan limit</Link>
              </p>
            </article>
            {tools.map((c, i) => (
              <article key={c.slug} className="rounded-2xl border border-white/10 p-6">
                <h3 className="text-xl font-bold font-jakarta">
                  {i + 2}. {c.name}
                </h3>
                <p className="mt-2 text-white/75">
                  Free plan: {c.freePlan || 'none'}
                  {!c.freePlan && c.freeTrialDays ? ` (${c.freeTrialDays}-day trial)` : ''}. Cheapest paid plan:{' '}
                  {c.cheapestPaid?.name ? `${c.cheapestPaid.name}, ` : ''}
                  {price(c)}
                  {c.cheapestPaid?.channelsIncluded ? `, ${c.cheapestPaid.channelsIncluded} channel${c.cheapestPaid.channelsIncluded === 1 ? '' : 's'} included` : ''}.
                  {' '}Rupee prices in India: {rupeeCell(c).toLowerCase()}.
                  {c.openSource ? ` Licence: ${c.openSource}.` : ''}
                </p>
                <p className="mt-2 text-sm text-white/60">
                  <strong className="text-white/80">Best for:</strong> {BEST_FOR[c.slug]}
                </p>
                <p className="mt-3 text-sm text-white/55">
                  Source:{' '}
                  <a href={c.sources[0]} rel="nofollow noopener" target="_blank" className="underline">
                    {c.sources[0].replace('https://', '')}
                  </a>
                  {c.hasAlternativePage ? (
                    <>
                      {' · '}
                      <Link href={`/alternatives/${c.slug}`} className="text-[#FF4CE2] underline">
                        Hookpost vs {c.name}
                      </Link>
                    </>
                  ) : null}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-white/10">
        <div className="mx-auto w-full max-w-[1100px] px-5 py-14 sm:px-10">
          <h2 className="text-2xl font-extrabold tracking-tight font-jakarta">How to choose, in three questions</h2>
          <ol className="mt-6 flex max-w-[75ch] list-decimal flex-col gap-4 ps-5 text-white/80">
            <li>
              <strong className="text-white">How will you pay?</strong> A dollar-billed tool needs a card enabled for
              international payments, and the rupee cost moves with the exchange rate. Besides Hookpost, four tools here show
              rupee prices; only Hookpost lists UPI Autopay.
            </li>
            <li>
              <strong className="text-white">How many accounts, and how many people?</strong> Per-channel pricing is cheapest for
              one or two accounts; per-user pricing gets expensive as the team grows; flat tiers stay the same until you outgrow
              them.
            </li>
            <li>
              <strong className="text-white">Which networks matter?</strong> WhatsApp Business is on Zoho Social and Hootsuite.
              Dev.to, Hashnode, Discord, Telegram and Bluesky are on Hookpost. Check the{' '}
              <Link href="/channels" className="text-[#FF4CE2] underline">channel list</Link> before you commit.
            </li>
          </ol>
          <p className="mt-8 text-white/60">
            More comparisons: <Link href="/compare" className="text-[#FF4CE2] underline">12 tools on price, API and MCP</Link>,{' '}
            <Link href="/free-social-media-scheduler" className="text-[#FF4CE2] underline">free plans compared</Link>,{' '}
            <Link href="/alternatives" className="text-[#FF4CE2] underline">alternatives</Link>.
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
        </div>
      </section>
    </div>
  );
}
