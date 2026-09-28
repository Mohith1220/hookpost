import { Metadata } from 'next';
import Link from 'next/link';
import { SiteNav } from '../site-nav';
import { pricingINR } from '@hookpost/nestjs-libraries/database/prisma/subscriptions/pricing';
import { CALENDAR, CalendarRow } from './calendar-data';

// Targets "social media calendar 2026 india", "social media festival calendar
// 2026 india" and the month variants ("november social media calendar india"),
// all of which Google autocompletes (Veritas run, 28 Sep 2026). Dates come from
// calendar-data.ts, which cites the DoPT lists. Server-rendered table, no
// client JS; the CSV is a static file in public/.

const CANONICAL = 'https://hookpost.hookstep.in/social-media-calendar-india';
const CSV = '/social-media-calendar-india-2026-27.csv';
const { FREE, STANDARD } = pricingINR;

const MONTH = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const DAY = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });

const byMonth = CALENDAR.reduce<Record<string, CalendarRow[]>>((acc, r) => {
  const m = MONTH(r.date);
  (acc[m] ||= []).push(r);
  return acc;
}, {});

const FAQ = [
  {
    q: 'When is Diwali in 2026?',
    a: 'Diwali falls on Sunday, 8 November 2026, per the Government of India (DoPT) holiday list. Dussehra is on Tuesday, 20 October 2026, and Bhai Dooj on Wednesday, 11 November 2026.',
  },
  {
    q: 'When is Holi in 2027?',
    a: 'Holi is on Tuesday, 23 March 2027, with Holika Dahan the evening before, on Monday, 22 March 2027, per the DoPT 2027 holiday list.',
  },
  {
    q: 'Why do some festival dates differ between sources?',
    a: 'Many Indian festivals follow the lunar calendar, and dates can differ by region and by a day. Islamic festivals such as Id-ul-Fitr depend on the moon sighting. This calendar uses the central government (DoPT) list for Delhi offices; check a local panchang for regional festivals.',
  },
  {
    q: 'How far ahead should I schedule festival posts?',
    a: 'Write and schedule the greeting at least a week ahead, and the sale or campaign teaser 7-10 days before a big festival such as Diwali. A scheduler lets you set the exact India-time slot so the post goes out even on the holiday itself.',
  },
  {
    q: 'Can I download this social media calendar?',
    a: 'Yes. The same dates and post ideas are available as a CSV file that opens in Google Sheets or Excel, with a column to tick off what you have scheduled.',
  },
];

export const metadata: Metadata = {
  title: 'Social Media Calendar India 2026: Festival Dates | Hookpost',
  description:
    'Indian festival and holiday dates for social media, October 2026 to March 2027, from the official DoPT lists, with a post idea for each. Free CSV download.',
  alternates: { canonical: CANONICAL },
  openGraph: {
    title: 'Social media calendar for India, Oct 2026 - Mar 2027',
    description: 'Festival dates from the official holiday lists, with a post idea for each day. Free CSV.',
    url: CANONICAL,
    siteName: 'Hookpost',
    type: 'article',
    locale: 'en_IN',
    images: [{ url: 'https://hookpost.hookstep.in/og-image.png', width: 1200, height: 630, alt: 'Social media calendar India 2026' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Social media calendar for India, Oct 2026 - Mar 2027',
    description: 'Festival dates with a post idea for each day. Free CSV.',
    images: ['https://hookpost.hookstep.in/og-image.png'],
  },
};

export default function SocialMediaCalendarIndiaPage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        '@id': `${CANONICAL}#article`,
        headline: 'Social media calendar for India: October 2026 to March 2027',
        inLanguage: 'en-IN',
        dateModified: '2026-09-28',
        author: { '@type': 'Organization', name: 'Hookpost', url: 'https://hookpost.hookstep.in/about' },
        publisher: { '@type': 'Organization', name: 'Hookstep', url: 'https://hookpost.hookstep.in/about' },
        mainEntityOfPage: CANONICAL,
        associatedMedia: {
          '@type': 'MediaObject',
          name: 'Social media calendar India 2026-27 (CSV)',
          contentUrl: `https://hookpost.hookstep.in${CSV}`,
          encodingFormat: 'text/csv',
        },
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
          { '@type': 'ListItem', position: 2, name: 'Social media calendar India', item: CANONICAL },
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
        <p className="text-sm font-semibold uppercase tracking-wider text-[#FF4CE2]">October 2026 to March 2027</p>
        <h1 className="mt-3 text-4xl font-extrabold tracking-tight font-jakarta sm:text-5xl text-balance">
          Social media calendar for India, 2026-27
        </h1>
        <p className="mt-5 max-w-[70ch] text-lg text-white/75">
          Every festival and holiday worth a post over the next six months, with the date, the weekday and one idea for what
          to publish. Holiday dates are taken from the Government of India&apos;s official DoPT holiday lists for 2026 and 2027,
          so you are not planning Diwali content around a blog&apos;s guess.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <a
            href={CSV}
            download
            className="rounded-full bg-[#FF4CE2] px-6 py-3 font-semibold text-black hover:opacity-90"
          >
            Download the CSV
          </a>
          <Link href="/auth" prefetch={false} className="rounded-full border border-white/20 px-6 py-3 font-semibold hover:border-[#FF4CE2]">
            Schedule them free
          </Link>
        </div>
      </section>

      {Object.entries(byMonth).map(([month, rows]) => (
        <section key={month} className="mx-auto w-full max-w-[1100px] px-5 pt-12 sm:px-10" aria-labelledby={`m-${rows[0].date.slice(0, 7)}`}>
          <h2 id={`m-${rows[0].date.slice(0, 7)}`} className="text-2xl font-extrabold tracking-tight font-jakarta">
            {month}
          </h2>
          <div className="mt-4 -mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
            <table className="w-full min-w-[680px] border-collapse text-left text-sm">
              <caption className="sr-only">Social media dates in {month}</caption>
              <thead>
                <tr className="border-b border-white/15 text-white/60">
                  <th scope="col" className="py-3 pe-4 font-semibold">Date</th>
                  <th scope="col" className="py-3 pe-4 font-semibold">Occasion</th>
                  <th scope="col" className="py-3 font-semibold">Post idea</th>
                </tr>
              </thead>
              <tbody className="text-white/80">
                {rows.map((r) => (
                  <tr key={r.date + r.occasion} className="border-b border-white/10">
                    <td className={`${cell} whitespace-nowrap`}>
                      <span className="font-semibold text-white">{DAY(r.date)}</span>
                      <span className="block text-xs text-white/50">{r.weekday}</span>
                    </td>
                    <th scope="row" className={`${cell} font-semibold text-white`}>
                      {r.occasion}
                      <span className="block text-xs font-normal text-white/50">{r.kind}</span>
                    </th>
                    <td className="py-3 align-top">{r.idea}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <section className="mx-auto w-full max-w-[1100px] px-5 py-12 sm:px-10">
        <p className="max-w-[75ch] text-sm text-white/55">
          Sources: Government of India, Department of Personnel &amp; Training, list of holidays for 2026 (O.M. F.No.12/2/2023-JCA
          dated 3 July 2025) and for 2027 (O.M. dated 16 July 2026), gazetted and restricted holidays for offices in Delhi/New
          Delhi. Restricted holidays are optional for government staff and vary by state. Id-ul-Fitr depends on the moon
          sighting. Checked 28 September 2026.
        </p>
      </section>

      <section className="border-t border-white/10">
        <div className="mx-auto w-full max-w-[1100px] px-5 py-14 sm:px-10">
          <h2 className="text-2xl font-extrabold tracking-tight font-jakarta">Turn the calendar into scheduled posts</h2>
          <ol className="mt-6 flex max-w-[75ch] list-decimal flex-col gap-3 ps-5 text-white/80">
            <li>Pick the dates that fit your audience. A B2B brand needs five or six of these, not all twenty-five.</li>
            <li>Write each post a week ahead, and the teaser for a big sale 7-10 days ahead.</li>
            <li>
              Schedule them in India time. Hookpost&apos;s calendar follows your browser&apos;s time zone, so a 9 AM slot goes out
              at 9 AM IST on the day, holiday or not.
            </li>
          </ol>
          <p className="mt-6 max-w-[75ch] text-white/70">
            The <Link href="/free-social-media-scheduler" className="text-[#FF4CE2] underline">free plan</Link> covers{' '}
            {FREE.channel} channels and {FREE.posts_per_month} posts a month, enough for this calendar on two networks. Standard
            is ₹{STANDARD.month_price} a month for {STANDARD.channel} channels with AI captions, billed in rupees with UPI Autopay.
            See <Link href="/social-media-scheduler-india" className="text-[#FF4CE2] underline">Hookpost for India</Link> or{' '}
            <Link href="/best-social-media-scheduler-india" className="text-[#FF4CE2] underline">the best schedulers for India compared</Link>.
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
