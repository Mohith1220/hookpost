import Link from 'next/link';

// The one footer for every marketing page, rendered from (landing)/layout.tsx.
//
// Before this, 25 pages carried their own footer - most of them four links
// long - and the rest had none at all. The /vs/ pages were linked from nowhere,
// and the API and open-source pages from two pages each, so crawlers and
// visitors could only reach them by typing the URL. Add a new marketing page
// here, not in a per-page footer.
type LinkGroup = [heading: string, links: [label: string, href: string][]];

const PRODUCT: LinkGroup = [
  'Product',
  [
    ['Channels', '/channels'],
    ['AI agents & MCP', '/mcp'],
    ['Pricing', '/pricing'],
    ['Free plan', '/free-social-media-scheduler'],
    ['For India (₹, UPI)', '/social-media-scheduler-india'],
    ['Best schedulers in India', '/best-social-media-scheduler-india'],
    ['By role', '/for'],
  ],
];

// Slugs are the ones that actually render: alternatives/<slug>/page.tsx and
// VS_ONLY in vs/[competitor]/page.tsx. The other /vs/ slugs 301 to
// /alternatives/ (next.config.js), so they are not linked twice.
const COMPARE: LinkGroup = [
  'Compare',
  [
    ['Compare tools', '/compare'],
    ['All alternatives', '/alternatives'],
    ['Buffer alternative', '/alternatives/buffer'],
    ['Hootsuite alternative', '/alternatives/hootsuite'],
    ['Later alternative', '/alternatives/later'],
    ['Sprout Social alternative', '/alternatives/sprout-social'],
    ['Postiz alternative', '/alternatives/postiz'],
    ['Mixpost alternative', '/alternatives/mixpost'],
    ['Publer alternative', '/alternatives/publer'],
    ['SocialPilot alternative', '/alternatives/socialpilot'],
    ['Agorapulse alternative', '/alternatives/agorapulse'],
    ['Metricool alternative', '/alternatives/metricool'],
    ['Planoly alternative', '/alternatives/planoly'],
    ['Typefully alternative', '/alternatives/typefully'],
    ['Hookpost vs Zoho Social', '/vs/zoho-social'],
    ['Hookpost vs Sendible', '/vs/sendible'],
    ['Hookpost vs Loomly', '/vs/loomly'],
    ['Hookpost vs Tailwind', '/vs/tailwind'],
    ['Hookpost vs CoSchedule', '/vs/co-schedule'],
    ['Hookpost vs MeetEdgar', '/vs/meet-edgar'],
  ],
];

const TOOLS: LinkGroup = [
  'Free tools',
  [
    ['Character counter', '/tools/character-counter'],
    ['X character counter', '/tools/x-character-counter'],
    ['LinkedIn character counter', '/tools/linkedin-character-counter'],
    ['Bluesky character counter', '/tools/bluesky-character-counter'],
    ['Thread splitter', '/tools/thread-splitter'],
    ['Social media calendar India', '/social-media-calendar-india'],
  ],
];

const DEVELOPERS: LinkGroup = [
  'Developers',
  [
    ['Public API', '/docs/public-api'],
    ['OAuth apps', '/docs/oauth'],
    ['Scheduling API', '/social-media-scheduling-api'],
    ['MCP servers compared', '/social-media-mcp-servers'],
    ['Open source', '/open-source-social-media-scheduler'],
    ['Self-hosting', '/guides/docker-self-hosting'],
    ['n8n integration', '/integrations/n8n'],
    ['Guides', '/guides'],
  ],
];

const COMPANY: LinkGroup = [
  'Company',
  [
    ['About', '/about'],
    ['Contact', '/contact'],
    ['Affiliates (earn 30%)', '/affiliates'],
    ['Privacy', '/privacy'],
    ['Terms', '/terms'],
  ],
];

// Razorpay's payment-method review looks for these policy pages linked from
// the site, not just reachable by URL.
const POLICIES: LinkGroup = [
  'Policies',
  [
    ['Refunds', '/refund-policy'],
    ['Cancellation', '/cancellation-policy'],
    ['Shipping & delivery', '/shipping-policy'],
    ['Data deletion', '/data-deletion'],
  ],
];

const Group = ({ group: [heading, links], wide }: { group: LinkGroup; wide?: boolean }) => (
  <div className={wide ? 'sm:col-span-2' : undefined}>
    <h2 className="text-xs font-bold uppercase tracking-wider text-white/60">{heading}</h2>
    <ul className={`mt-4 grid gap-2.5 text-sm ${wide ? 'sm:grid-cols-2 sm:gap-x-6' : ''}`}>
      {links.map(([label, href]) => (
        <li key={href}>
          <Link href={href} prefetch={false} className="text-white/65 transition-colors hover:text-[#FF4CE2]">
            {label}
          </Link>
        </li>
      ))}
    </ul>
  </div>
);

export const SiteFooter = () => (
  <footer className="border-t border-white/10 bg-black text-white font-dm">
    <div className="mx-auto w-full max-w-[1280px] px-5 py-14 sm:px-10">
      <div className="flex items-center gap-2.5">
        <img src="/brand-logo-96.webp" width="96" height="96" alt="" className="h-7 w-auto object-contain" />
        <span className="font-extrabold tracking-tight">Hookpost</span>
      </div>
      <p className="mt-4 max-w-[48ch] text-sm leading-relaxed text-white/50">
        Open-source social media scheduling, by Hookstep
      </p>
      <p className="mt-2 max-w-[48ch] text-sm leading-relaxed text-white/50">
        Also by Hookstep:{' '}
        <a href="https://tablamigo.hookstep.in" className="text-white/70 underline-offset-2 hover:text-[#FF4CE2] hover:underline">
          Tablamigo, meet solo travelers nearby
        </a>
      </p>

      <div className="mt-10 grid gap-10 sm:grid-cols-2 lg:grid-cols-7">
        <Group group={PRODUCT} />
        <Group group={COMPARE} wide />
        <Group group={TOOLS} />
        <Group group={DEVELOPERS} />
        <Group group={COMPANY} />
        <Group group={POLICIES} />
      </div>

      <div className="mt-12 flex flex-col gap-3 border-t border-white/10 pt-7 text-sm text-white/60 sm:flex-row sm:items-center sm:justify-between">
        {/* No address here: /contact shows the area only (Ghatkopar, Mumbai),
            on the founder's instruction. Never print the street address. */}
        <p>
          © {new Date().getFullYear()} Hookstep. Licensed under AGPL-3.0.
        </p>
        <div className="flex flex-wrap items-center gap-6">
          <a
            href="https://github.com/jatinder14/hookpost"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[#FF4CE2]"
          >
            GitHub
          </a>
          <a
            href="https://www.linkedin.com/company/hookpost"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[#FF4CE2]"
          >
            LinkedIn
          </a>
          <a href="mailto:support@hookstep.in" className="hover:text-[#FF4CE2]">
            support@hookstep.in
          </a>
        </div>
      </div>
    </div>
  </footer>
);
