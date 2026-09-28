import { Metadata } from 'next';
import Link from 'next/link';
import { SiteNav } from '../site-nav';
import { pricingINR } from '@hookpost/nestjs-libraries/database/prisma/subscriptions/pricing';
import {
  COMPETITOR_FACTS,
  CompetitorFacts,
  FACTS_CHECKED,
} from '../compare/competitor-facts';

// Targets "social media mcp server", "best social media mcp servers",
// "social media scheduler mcp" (autocomplete-backed, Veritas run 28 Sep 2026).
// Page 1 is listicles from other schedulers (pallyy, eden, socialync,
// opentweet) plus GitHub repos; /mcp is a product page and does not rank for
// the comparison query.
//
// Honest framing matters here: 10 of the 12 tools in competitor-facts.ts list
// an MCP server, so MCP is NOT a Hookpost differentiator (see /compare). The
// page says so. Competitor rows render from competitor-facts.ts; Hookpost's
// tool names are the ones registered in chat/tools/tool.list.ts (hosted) and
// mcp-server/src/index.ts (stdio) - keep them in sync with the code.

const CANONICAL = 'https://hookpost.hookstep.in/social-media-mcp-servers';
const { STANDARD } = pricingINR;

const ORDER = ['buffer', 'hootsuite', 'sprout-social', 'metricool', 'publer', 'socialpilot', 'agorapulse', 'zoho-social', 'postiz', 'mixpost', 'later', 'sendible'];

const HOSTED_TOOLS = ['integrationList', 'groupList', 'integrationSchema', 'schedulePostTool', 'postsListTool', 'postSettingsTool', 'uploadFromUrlTool', 'generateImageTool'];
const STDIO_TOOLS = ['list_channels', 'list_groups', 'get_channel_settings', 'find_free_slot', 'upload_media_from_url', 'create_post', 'list_posts', 'delete_post'];

const mcpSource = (c: CompetitorFacts) =>
  c.sources.find((s) => /mcp|chatgpt|agent/i.test(s)) || c.sources[0];

const mcpCell = (c: CompetitorFacts) => (c.mcp == null ? 'Not stated' : c.mcp ? 'Yes' : 'No');

const entry = (c: CompetitorFacts) => {
  const p = c.cheapestPaid;
  if (!p) return 'Not published';
  const sym = p.currency === 'USD' ? '$' : `${p.currency} `;
  if (p.billing === 'one-time') return `${sym}${p.price} one-time`;
  return `${sym}${p.price} / ${p.per.replace('/month', '').replace('month', 'mo')}${p.billing === 'annual' ? ' (yearly)' : ''}`;
};

const withMcp = ORDER.map((k) => COMPETITOR_FACTS[k]).filter((c) => c && c.mcp);

const FAQ = [
  {
    q: 'What is a social media MCP server?',
    a: 'An MCP (Model Context Protocol) server lets an AI assistant such as Claude, ChatGPT or Cursor call a tool directly. A social media MCP server exposes actions like "list my channels" and "schedule this post", so you can ask the assistant to plan and publish posts instead of copying text into a scheduler.',
  },
  {
    q: 'Which social media schedulers have an MCP server?',
    a: `Most of them now do. Of the twelve schedulers we checked on ${FACTS_CHECKED}, ${withMcp.length} list an MCP server or AI-assistant connection: ${withMcp.map((c) => c.name).join(', ')}. Hookpost has one too. Later and Sendible did not state one on their pages.`,
  },
  {
    q: 'Is there an open-source social media MCP server?',
    a: 'Yes. Hookpost (AGPL-3.0) ships a hosted MCP endpoint and a standalone stdio server in its public repository, and can be self-hosted with Docker. Postiz (AGPL-3.0) also has an MCP server and an agent CLI. Mixpost Lite is MIT-licensed.',
  },
  {
    q: 'Can Claude schedule social media posts?',
    a: `Yes, through an MCP server. With Hookpost, add the endpoint to Claude Desktop or Claude Code, and Claude can list your connected channels, check each network's rules and schedule posts. It needs a Hookpost API key, which comes with Standard (₹${STANDARD.month_price} a month) and above.`,
  },
  {
    q: 'Can an MCP server read my post analytics?',
    a: "It depends on the tool. Hookpost's MCP tools schedule, list and manage posts but do not return engagement analytics. Check each vendor's MCP documentation for which actions it exposes before you rely on it for reporting.",
  },
];

export const metadata: Metadata = {
  title: 'Social Media MCP Servers Compared (2026) | Hookpost',
  description: `Which social media schedulers ship an MCP server for Claude, ChatGPT and Cursor: ${withMcp.length + 1} tools compared on price, open source and what the tools can do.`,
  alternates: { canonical: CANONICAL },
  openGraph: {
    title: 'Social media MCP servers compared (2026)',
    description: 'Schedulers with an MCP server for AI assistants, compared on price, licence and tools.',
    url: CANONICAL,
    siteName: 'Hookpost',
    type: 'article',
    images: [{ url: 'https://hookpost.hookstep.in/og-image.png', width: 1200, height: 630, alt: 'Social media MCP servers compared' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Social media MCP servers compared (2026)',
    description: 'Schedulers with an MCP server, compared on price, licence and tools.',
    images: ['https://hookpost.hookstep.in/og-image.png'],
  },
};

export default function SocialMediaMcpServersPage() {
  const tools = ORDER.map((k) => COMPETITOR_FACTS[k]).filter(Boolean);
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        '@id': `${CANONICAL}#article`,
        headline: 'Social media MCP servers compared',
        dateModified: '2026-09-28',
        author: { '@type': 'Organization', name: 'Hookpost', url: 'https://hookpost.hookstep.in/about' },
        publisher: { '@type': 'Organization', name: 'Hookstep', url: 'https://hookpost.hookstep.in/about' },
        mainEntityOfPage: CANONICAL,
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
          { '@type': 'ListItem', position: 2, name: 'AI agents & MCP', item: 'https://hookpost.hookstep.in/mcp' },
          { '@type': 'ListItem', position: 3, name: 'Social media MCP servers compared', item: CANONICAL },
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
        <p className="text-sm font-semibold uppercase tracking-wider text-[#FF4CE2]">Checked {FACTS_CHECKED}</p>
        <h1 className="mt-3 text-4xl font-extrabold tracking-tight font-jakarta sm:text-5xl text-balance">
          Social media MCP servers compared
        </h1>
        <p className="mt-5 max-w-[70ch] text-lg text-white/75">
          An MCP server lets Claude, ChatGPT or Cursor schedule posts for you, and{' '}
          {withMcp.length} of the 12 major schedulers we track now list one. So the useful questions are what it costs, whether the
          code is open, and what the assistant can actually do once connected.
        </p>
        <p className="mt-4 max-w-[70ch] rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/70">
          <strong className="text-white">Disclosure:</strong> we make Hookpost. Every other row comes from the vendor&apos;s own
          pages, linked in the table.
        </p>
      </section>

      <section className="mx-auto w-full max-w-[1100px] px-5 py-10 sm:px-10" aria-labelledby="table">
        <h2 id="table" className="text-2xl font-extrabold tracking-tight font-jakarta">Schedulers and their MCP support</h2>
        <div className="mt-6 -mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
          <table className="w-full min-w-[820px] border-collapse text-left text-sm">
            <caption className="sr-only">Social media schedulers with MCP servers</caption>
            <thead>
              <tr className="border-b border-white/15 text-white/60">
                {['Tool', 'MCP / AI assistant', 'Cheapest paid plan', 'Free plan', 'Open source', 'Source'].map((h) => (
                  <th key={h} scope="col" className="py-3 pe-4 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="text-white/80">
              <tr className="border-b border-white/10 bg-[#FF4CE2]/[0.06]">
                <th scope="row" className={`${cell} font-bold text-white`}>
                  <Link href="/mcp" className="hover:text-[#FF4CE2]">Hookpost</Link>
                </th>
                <td className={cell}>Yes, hosted endpoint and stdio server (Standard and above)</td>
                <td className={cell}>₹{STANDARD.month_price} / mo, {STANDARD.channel} channels</td>
                <td className={cell}>Yes (no API or MCP)</td>
                <td className={cell}>AGPL-3.0</td>
                <td className={cell}>
                  <Link href="/mcp" className="underline">/mcp</Link>
                </td>
              </tr>
              {tools.map((c) => (
                <tr key={c.slug} className="border-b border-white/10">
                  <th scope="row" className={`${cell} font-bold text-white`}>{c.name}</th>
                  <td className={cell}>{mcpCell(c)}</td>
                  <td className={cell}>{entry(c)}</td>
                  <td className={cell}>{c.freePlan ? 'Yes' : c.freeTrialDays ? `${c.freeTrialDays}-day trial` : 'No'}</td>
                  <td className={cell}>{c.openSource ? c.openSource.split(' ')[0] : 'No'}</td>
                  <td className={cell}>
                    <a href={mcpSource(c)} rel="nofollow noopener" target="_blank" className="underline break-all">
                      {mcpSource(c).replace(/^https:\/\/(www\.)?/, '')}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-sm text-white/55">
          &quot;Not stated&quot; means the vendor&apos;s pages did not mention an MCP server when we checked, not that one cannot
          exist. Which plan includes MCP differs by vendor: Buffer includes it on its free plan; Hookpost requires Standard.
        </p>
      </section>

      <section className="border-t border-white/10">
        <div className="mx-auto w-full max-w-[1100px] px-5 py-14 sm:px-10">
          <h2 className="text-2xl font-extrabold tracking-tight font-jakarta">What Hookpost&apos;s MCP server can do</h2>
          <p className="mt-4 max-w-[75ch] text-white/75">
            Two ways to connect. The hosted endpoint needs only an API key; the stdio server runs from the{' '}
            <a href="https://github.com/jatinder14/hookpost/tree/main/mcp-server" rel="noopener" target="_blank" className="text-[#FF4CE2] underline">
              public repository
            </a>{' '}
            against the hosted service or your own self-hosted instance.
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/10 p-6">
              <h3 className="text-lg font-bold font-jakarta">Hosted endpoint</h3>
              <p className="mt-2 text-sm text-white/60">Tools the assistant sees:</p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {HOSTED_TOOLS.map((t) => (
                  <li key={t} className="rounded-md bg-white/[0.06] px-2 py-1 font-mono text-xs text-white/80">{t}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-white/10 p-6">
              <h3 className="text-lg font-bold font-jakarta">Standalone stdio server</h3>
              <p className="mt-2 text-sm text-white/60">Tools the assistant sees:</p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {STDIO_TOOLS.map((t) => (
                  <li key={t} className="rounded-md bg-white/[0.06] px-2 py-1 font-mono text-xs text-white/80">{t}</li>
                ))}
              </ul>
            </div>
          </div>
          <p className="mt-6 text-sm text-white/60">Claude Desktop configuration for the hosted endpoint:</p>
          <pre className="mt-2 overflow-x-auto rounded-xl border border-white/10 bg-[#0b0b0b] p-4 text-xs text-white/80">
{`{
  "mcpServers": {
    "hookpost": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://hookpost.hookstep.in/api/mcp/YOUR_API_KEY"]
    }
  }
}`}
          </pre>
          <p className="mt-6 max-w-[75ch] text-white/70">
            Neither server returns engagement analytics; they schedule, list and manage posts. Step-by-step setup:{' '}
            <Link href="/guides/claude-mcp-social-media" className="text-[#FF4CE2] underline">schedule posts from Claude</Link>. Full
            product page: <Link href="/mcp" className="text-[#FF4CE2] underline">AI agents &amp; MCP</Link>. Prefer plain HTTP?{' '}
            <Link href="/social-media-scheduling-api" className="text-[#FF4CE2] underline">The scheduling API</Link>.
          </p>
        </div>
      </section>

      <section className="border-t border-white/10">
        <div className="mx-auto w-full max-w-[1100px] px-5 py-14 sm:px-10">
          <h2 className="text-2xl font-extrabold tracking-tight font-jakarta">How to choose</h2>
          <ul className="mt-6 flex max-w-[75ch] list-disc flex-col gap-3 ps-5 text-white/80">
            <li>
              <strong className="text-white">You already use a scheduler:</strong> check whether it lists MCP before switching.
              Most do, and moving tools only for MCP rarely pays off.
            </li>
            <li>
              <strong className="text-white">You want to self-host or read the code:</strong> Hookpost and Postiz are AGPL-3.0;
              see <Link href="/open-source-social-media-scheduler" className="text-[#FF4CE2] underline">open-source schedulers compared</Link>.
            </li>
            <li>
              <strong className="text-white">You pay in rupees:</strong> Hookpost bills in INR with UPI Autopay; see{' '}
              <Link href="/best-social-media-scheduler-india" className="text-[#FF4CE2] underline">schedulers for India compared</Link>.
            </li>
          </ul>
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
