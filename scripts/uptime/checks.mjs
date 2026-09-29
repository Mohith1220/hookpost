/**
 * What the uptime monitor checks. Run by .github/workflows/uptime.yml every
 * 5 minutes from GitHub's runners, i.e. from outside the Contabo VM that
 * Hookpost and Tablamigo share, so a dead VM still raises an alert.
 *
 * HTTP checks: `url` must answer `status` within the timeout, and `expect`
 * (when given) must return true for the response.
 * TLS checks: the certificate served for `host` must have at least
 * MIN_TLS_DAYS left. `connect` probes a specific IP instead of DNS: the public
 * hostnames all resolve to Cloudflare, whose edge certificate renews itself,
 * so the Let's Encrypt certificates on the VM are checked at the origin.
 */

export const MIN_TLS_DAYS = 14;

// The Contabo VM (Hookpost + Tablamigo). Origin TLS is checked here directly.
const ORIGIN_IP = process.env.ORIGIN_IP ?? '203.0.113.10';

const html = (marker) => (r) =>
  /text\/html/i.test(r.contentType) && (!marker || r.body.includes(marker));

export const CHECKS = [
  // Hookpost
  {
    name: 'Hookpost home',
    url: 'https://hookpost.hookstep.in/',
    expect: html('Hookpost'),
  },
  {
    // HealthController: one Prisma read. 503 when the database is unreachable.
    name: 'Hookpost API health',
    url: 'https://hookpost.hookstep.in/api/health',
    expect: (r) => r.json?.db === 'ok',
  },
  {
    // Same endpoint: has an orchestrator worker polled the "main" Temporal
    // task queue in the last 3 minutes? Without one, no post or email goes out.
    name: 'Hookpost worker',
    url: 'https://hookpost.hookstep.in/api/health',
    expect: (r) => r.json?.worker === 'ok',
  },

  // Tablamigo
  {
    name: 'Tablamigo site',
    url: 'https://tablamigo.hookstep.in/',
    expect: html('Tablamigo'),
  },
  {
    // GET /health on the Fastify API. Also runs `select 1` against Postgres
    // once the support-autoreply branch is deployed; `ok` is true either way
    // only when everything it checks is up.
    name: 'Tablamigo API health',
    url: 'https://tablamigo-api.hookstep.in/health',
    expect: (r) => r.json?.ok === true,
  },
  {
    // The PWA. /app redirects to /app/, which serves the Expo web build.
    name: 'Tablamigo web app',
    url: 'https://tablamigo.hookstep.in/app',
    expect: html('id="root"'),
  },

  // Hookstep (Cloud Run)
  {
    name: 'Hookstep home',
    url: 'https://hookstep.in/',
    expect: html('HookStep'),
  },
  {
    // Public job list: a Next.js route handler that reads MongoDB.
    name: 'Hookstep jobs API',
    url: 'https://hookstep.in/api/jobs',
    expect: (r) => Array.isArray(r.json?.jobs),
  },

  // TLS
  { name: 'TLS hookpost.hookstep.in', tls: { host: 'hookpost.hookstep.in' } },
  { name: 'TLS tablamigo.hookstep.in', tls: { host: 'tablamigo.hookstep.in' } },
  { name: 'TLS tablamigo-api.hookstep.in', tls: { host: 'tablamigo-api.hookstep.in' } },
  { name: 'TLS hookstep.in', tls: { host: 'hookstep.in' } },
  {
    name: 'TLS origin hookpost.hookstep.in',
    tls: { host: 'hookpost.hookstep.in', connect: ORIGIN_IP },
  },
  {
    name: 'TLS origin tablamigo',
    tls: { host: 'tablamigo-api.hookstep.in', connect: ORIGIN_IP },
  },
];
