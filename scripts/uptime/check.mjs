#!/usr/bin/env node
/**
 * Uptime monitor. One run = probe every check once, update state, and open or
 * close GitHub issues / send emails on transitions only.
 *
 *   node scripts/uptime/check.mjs <state-file>
 *
 * Rules
 * - A check is DOWN after FAIL_THRESHOLD consecutive failed runs. The
 *   consecutive-failure count lives in the state file, which the workflow
 *   carries between runs with actions/cache.
 * - The open issue titled "DOWN: <check>" is the source of truth for "we
 *   already alerted". Losing the state file can delay an alert by one run but
 *   can never duplicate one.
 * - Down: open the issue (if none is open) and send ONE email.
 *   Still down: nothing. Recovered: comment "recovered after N min", close the
 *   issue, send ONE email.
 * - The run never fails because a check failed or an email bounced; only a bug
 *   in this script fails it, so GitHub's own failure emails stay meaningful.
 *
 * Env: GITHUB_TOKEN, GITHUB_REPOSITORY, RESEND_API_KEY, ALERT_EMAIL (comma
 * separated), ALERT_FROM.
 */
import fs from 'node:fs';
import tls from 'node:tls';
import { fileURLToPath } from 'node:url';
import { CHECKS, MIN_TLS_DAYS } from './checks.mjs';
import { downEmail, formatIst, recoveredEmail } from './email.mjs';

export const FAIL_THRESHOLD = 2;
export const TIMEOUT_MS = 10_000;
export const DEFAULT_ALERT_EMAIL = 'support@hookstep.in,admin@example.com';
// hookstep.in is the domain verified in Resend; the products send from it too.
export const DEFAULT_ALERT_FROM = 'Hookstep Uptime <support@hookstep.in>';
const TITLE_PREFIX = 'DOWN: ';
const USER_AGENT =
  'Mozilla/5.0 (compatible; HookstepUptime/1.0; +https://github.com/jatinder14/hookpost)';

export const issueTitle = (check) => `${TITLE_PREFIX}${check}`;
const FIRST_FAIL_MARKER = /<!-- uptime:first-failure=([^ ]+) -->/;

// ---------------------------------------------------------------------------
// Probes
// ---------------------------------------------------------------------------

export async function probeHttp(check, { fetchImpl = fetch, timeoutMs = TIMEOUT_MS } = {}) {
  try {
    const res = await fetchImpl(check.url, {
      redirect: 'follow',
      headers: { 'user-agent': USER_AGENT, accept: 'application/json, text/html;q=0.9' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = await res.text();
    const contentType = res.headers.get('content-type') || '';
    let json;
    if (/json/i.test(contentType)) {
      try {
        json = JSON.parse(body);
      } catch {
        json = undefined;
      }
    }
    const want = check.status ?? 200;
    if (res.status !== want) {
      return { ok: false, error: `HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ''}` };
    }
    if (check.expect && !check.expect({ status: res.status, contentType, body, json })) {
      const snippet = body.replace(/\s+/g, ' ').slice(0, 120);
      return { ok: false, error: `HTTP ${res.status}, unexpected body: ${snippet}` };
    }
    return { ok: true };
  } catch (e) {
    const name = e?.name || '';
    if (name === 'TimeoutError' || name === 'AbortError') {
      return { ok: false, error: `timeout after ${Math.round(timeoutMs / 1000)}s` };
    }
    const cause = e?.cause?.code || e?.cause?.message || e?.message || String(e);
    return { ok: false, error: `request failed: ${cause}` };
  }
}

/** Resolves to the peer certificate's expiry for `host` (optionally via `connect`). */
export function readCertExpiry({ host, connect, port = 443 }, timeoutMs = TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({
      host: connect || host,
      port,
      servername: host,
      // Expired or mismatched certificates still have to be read and reported.
      rejectUnauthorized: false,
    });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`timeout after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);
    socket.once('secureConnect', () => {
      clearTimeout(timer);
      const cert = socket.getPeerCertificate();
      const mismatch = cert && cert.subject ? tls.checkServerIdentity(host, cert) : new Error('no certificate');
      socket.end();
      if (!cert || !cert.valid_to) return reject(new Error('no certificate'));
      resolve({
        validTo: new Date(cert.valid_to),
        hostnameError: mismatch ? mismatch.message : null,
      });
    });
    socket.once('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
  });
}

export async function probeTls(check, { now = new Date(), readExpiry = readCertExpiry } = {}) {
  try {
    const { validTo, hostnameError } = await readExpiry(check.tls);
    if (hostnameError) return { ok: false, error: `certificate does not match: ${hostnameError}` };
    const days = Math.floor((validTo.getTime() - now.getTime()) / 86_400_000);
    const when = validTo.toISOString().slice(0, 10);
    if (days < MIN_TLS_DAYS) {
      return {
        ok: false,
        error: days < 0 ? `certificate expired on ${when}` : `certificate expires in ${days} days (${when})`,
      };
    }
    return { ok: true, days };
  } catch (e) {
    return { ok: false, error: `TLS handshake failed: ${e?.code || e?.message || e}` };
  }
}

export const targetOf = (check) =>
  check.url || `${check.tls.host}:443${check.tls.connect ? ` via ${check.tls.connect}` : ''}`;

export function probe(check, deps = {}) {
  return check.tls ? probeTls(check, deps) : probeHttp(check, deps);
}

// ---------------------------------------------------------------------------
// GitHub issues and email (both injectable so the test can stub them)
// ---------------------------------------------------------------------------

export function createGithub({ token, repo, fetchImpl = fetch }) {
  const api = async (method, path, body) => {
    const res = await fetchImpl(`https://api.github.com/repos/${repo}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        'user-agent': 'hookstep-uptime',
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`GitHub ${method} ${path}: ${res.status} ${(await res.text()).slice(0, 200)}`);
    return res.status === 204 ? null : res.json();
  };
  return {
    /** Open issues whose title starts with "DOWN: ", keyed by title. */
    async openDownIssues() {
      const found = new Map();
      for (let page = 1; page <= 10; page++) {
        const items = await api('GET', `/issues?state=open&per_page=100&page=${page}`);
        for (const it of items) {
          if (!it.pull_request && it.title.startsWith(TITLE_PREFIX)) found.set(it.title, it);
        }
        if (items.length < 100) break;
      }
      return found;
    },
    openIssue: (title, body) => api('POST', '/issues', { title, body }),
    comment: (number, body) => api('POST', `/issues/${number}/comments`, { body }),
    close: (number) => api('PATCH', `/issues/${number}`, { state: 'closed', state_reason: 'completed' }),
  };
}

export function createMailer({ apiKey, from, to, fetchImpl = fetch, log = console }) {
  return {
    async send(email, idempotencyKey) {
      if (!apiKey) {
        log.warn(`RESEND_API_KEY is not set; not emailing "${email.subject}"`);
        return false;
      }
      try {
        const res = await fetchImpl('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            authorization: `Bearer ${apiKey}`,
            'content-type': 'application/json',
            ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
          },
          body: JSON.stringify({ from, to, subject: email.subject, html: email.html, text: email.text }),
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) {
          log.error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
          return false;
        }
        return true;
      } catch (e) {
        log.error(`Resend request failed: ${e?.message || e}`);
        return false;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// One run
// ---------------------------------------------------------------------------

function issueBody({ check, target, error, firstFailedAt, runUrl }) {
  return [
    `**Check:** ${check}`,
    `**Target:** ${target}`,
    `**Error:** ${error}`,
    `**Failing since:** ${formatIst(firstFailedAt)} (${FAIL_THRESHOLD} consecutive failed runs)`,
    runUrl ? `**Run:** ${runUrl}` : null,
    '',
    'Opened by `.github/workflows/uptime.yml`. It is commented on and closed automatically when the check passes again; one email goes out now and one on recovery.',
    '',
    `<!-- uptime:first-failure=${new Date(firstFailedAt).toISOString()} -->`,
  ]
    .filter((l) => l !== null)
    .join('\n');
}

/**
 * Probe every check, then act on transitions. Returns the new state and a list
 * of what happened (for the log and the test).
 */
export async function runOnce({
  checks = CHECKS,
  state = {},
  now = new Date(),
  github,
  mailer,
  probeImpl = probe,
  runUrl,
  log = console,
}) {
  const prev = state.checks || {};
  const next = {};
  const events = [];

  const results = await Promise.all(checks.map((c) => probeImpl(c, { now })));
  const open = await github.openDownIssues();

  for (let i = 0; i < checks.length; i++) {
    const check = checks[i];
    const result = results[i];
    const title = issueTitle(check.name);
    const issue = open.get(title);
    const target = targetOf(check);
    const before = prev[check.name] || { fails: 0, firstFailedAt: null };

    if (result.ok) {
      next[check.name] = { fails: 0, firstFailedAt: null };
      if (issue) {
        const marker = (issue.body || '').match(FIRST_FAIL_MARKER);
        const since = new Date(marker ? marker[1] : issue.created_at);
        const minutes = Math.max(1, Math.round((now.getTime() - since.getTime()) / 60_000));
        await github.comment(issue.number, `Recovered after ${minutes} min (${formatIst(now)}).`);
        await github.close(issue.number);
        await mailer.send(
          recoveredEmail({ check: check.name, target, minutes, recoveredAt: now, issueUrl: issue.html_url }),
          `uptime/${issue.number}/recovered`
        );
        events.push({ type: 'recovered', check: check.name, issue: issue.number, minutes });
      }
      continue;
    }

    const fails = before.fails + 1;
    const firstFailedAt = before.firstFailedAt || now.toISOString();
    next[check.name] = { fails, firstFailedAt, lastError: result.error };
    log.log(`FAIL ${check.name} (${fails}x): ${result.error}`);

    if (issue) {
      events.push({ type: 'still_down', check: check.name, issue: issue.number });
      continue;
    }
    if (fails < FAIL_THRESHOLD) {
      events.push({ type: 'first_failure', check: check.name, fails });
      continue;
    }

    const created = await github.openIssue(
      title,
      issueBody({ check: check.name, target, error: result.error, firstFailedAt, runUrl })
    );
    await mailer.send(
      downEmail({ check: check.name, target, error: result.error, firstFailedAt, issueUrl: created.html_url }),
      `uptime/${created.number}/down`
    );
    events.push({ type: 'down', check: check.name, issue: created.number });
  }

  return { state: { checks: next, updatedAt: now.toISOString() }, events, results };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

async function main() {
  const stateFile = process.argv[2] || '.uptime-state.json';
  const { GITHUB_TOKEN, GITHUB_REPOSITORY, RESEND_API_KEY, GITHUB_SERVER_URL, GITHUB_RUN_ID } = process.env;
  if (!GITHUB_TOKEN || !GITHUB_REPOSITORY) {
    throw new Error('GITHUB_TOKEN and GITHUB_REPOSITORY are required');
  }

  let state = {};
  try {
    state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  } catch {
    console.log(`No previous state at ${stateFile}; starting fresh.`);
  }

  const to = (process.env.ALERT_EMAIL || DEFAULT_ALERT_EMAIL)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const { state: nextState, events, results } = await runOnce({
    state,
    github: createGithub({ token: GITHUB_TOKEN, repo: GITHUB_REPOSITORY }),
    mailer: createMailer({
      apiKey: RESEND_API_KEY,
      from: process.env.ALERT_FROM || DEFAULT_ALERT_FROM,
      to,
    }),
    runUrl:
      GITHUB_SERVER_URL && GITHUB_RUN_ID
        ? `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`
        : undefined,
  });

  fs.writeFileSync(stateFile, JSON.stringify(nextState, null, 2));
  CHECKS.forEach((c, i) =>
    console.log(`${results[i].ok ? 'ok  ' : 'FAIL'} ${c.name}${results[i].ok ? '' : `: ${results[i].error}`}`)
  );
  for (const e of events) console.log(JSON.stringify(e));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
