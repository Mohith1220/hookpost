/**
 * Uptime monitor logic, against a fake URL with GitHub and Resend stubbed.
 *   node --test scripts/uptime/check.test.mjs
 *
 * Walks one check through: down (1st failure) -> still down (2nd: issue +
 * email) -> still down (nothing new) -> up (comment, close, recovery email).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { runOnce, probeHttp, probeTls, issueTitle, FAIL_THRESHOLD } from './check.mjs';
import { downEmail, recoveredEmail, FOOTER_LINE } from './email.mjs';

function fakeServer() {
  let mode = 'down';
  const server = http.createServer((req, res) => {
    if (mode === 'up') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ db: 'ok', worker: 'ok' }));
    } else if (mode === 'hang') {
      // never answers; the probe must time out
    } else {
      res.writeHead(503, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ db: 'error' }));
    }
  });
  return {
    set: (m) => (mode = m),
    start: () =>
      new Promise((r) => server.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${server.address().port}/health`))),
    stop: () => new Promise((r) => { server.closeAllConnections?.(); server.close(r); }),
  };
}

function fakeGithub() {
  const issues = [];
  const calls = [];
  return {
    issues,
    calls,
    async openDownIssues() {
      return new Map(issues.filter((i) => i.state === 'open').map((i) => [i.title, i]));
    },
    async openIssue(title, body) {
      const it = {
        number: issues.length + 1,
        title,
        body,
        state: 'open',
        created_at: new Date().toISOString(),
        html_url: `https://github.com/x/y/issues/${issues.length + 1}`,
        comments: [],
      };
      issues.push(it);
      calls.push(['open', title]);
      return it;
    },
    async comment(number, body) {
      issues[number - 1].comments.push(body);
      calls.push(['comment', number, body]);
    },
    async close(number) {
      issues[number - 1].state = 'closed';
      calls.push(['close', number]);
    },
  };
}

function fakeMailer() {
  const sent = [];
  return { sent, async send(email, key) { sent.push({ ...email, key }); return true; } };
}

const quiet = { log() {}, warn() {}, error() {} };

test('down, still down, still down, then up', async () => {
  const srv = fakeServer();
  const url = await srv.start();
  const checks = [{ name: 'Fake API health', url, expect: (r) => r.json?.db === 'ok' }];
  const github = fakeGithub();
  const mailer = fakeMailer();
  const t0 = new Date('2026-09-29T10:00:00Z');
  const at = (min) => new Date(t0.getTime() + min * 60_000);
  let state = {};

  try {
    // Run 1: first failure. Counted, nothing opened or sent.
    srv.set('down');
    let r = await runOnce({ checks, state, now: at(0), github, mailer, log: quiet });
    state = r.state;
    assert.deepEqual(r.events, [{ type: 'first_failure', check: 'Fake API health', fails: 1 }]);
    assert.equal(github.issues.length, 0);
    assert.equal(mailer.sent.length, 0);
    assert.equal(state.checks['Fake API health'].fails, 1);
    assert.match(state.checks['Fake API health'].lastError, /HTTP 503/);

    // Run 2: second consecutive failure. One issue, one email.
    r = await runOnce({ checks, state, now: at(5), github, mailer, log: quiet });
    state = r.state;
    assert.equal(FAIL_THRESHOLD, 2);
    assert.equal(r.events[0].type, 'down');
    assert.equal(github.issues.length, 1);
    assert.equal(github.issues[0].title, issueTitle('Fake API health'));
    assert.equal(github.issues[0].title, 'DOWN: Fake API health');
    assert.match(github.issues[0].body, /HTTP 503/);
    assert.match(github.issues[0].body, /uptime:first-failure=2026-09-29T10:00:00.000Z/);
    assert.equal(mailer.sent.length, 1);
    assert.equal(mailer.sent[0].subject, 'DOWN: Fake API health');
    assert.match(mailer.sent[0].html, /HTTP 503/);
    assert.match(mailer.sent[0].html, /3:30\s?pm IST/i); // 10:00 UTC first failure
    assert.match(mailer.sent[0].html, /issues\/1/);

    // Run 3: still down, now timing out. No second issue, no second email.
    srv.set('hang');
    const probeFast = (c) => probeHttp(c, { timeoutMs: 300 });
    r = await runOnce({ checks, state, now: at(10), github, mailer, probeImpl: probeFast, log: quiet });
    state = r.state;
    assert.deepEqual(r.events, [{ type: 'still_down', check: 'Fake API health', issue: 1 }]);
    assert.match(state.checks['Fake API health'].lastError, /timeout/);
    assert.equal(github.issues.length, 1);
    assert.equal(mailer.sent.length, 1);

    // Run 4: up. Comment with the duration since the FIRST failure, close, one recovery email.
    srv.set('up');
    r = await runOnce({ checks, state, now: at(15), github, mailer, log: quiet });
    state = r.state;
    assert.deepEqual(r.events, [{ type: 'recovered', check: 'Fake API health', issue: 1, minutes: 15 }]);
    assert.equal(github.issues[0].state, 'closed');
    assert.match(github.issues[0].comments[0], /^Recovered after 15 min/);
    assert.equal(mailer.sent.length, 2);
    assert.equal(mailer.sent[1].subject, 'RECOVERED: Fake API health');
    assert.equal(state.checks['Fake API health'].fails, 0);

    // Run 5: still up. Nothing happens.
    r = await runOnce({ checks, state, now: at(20), github, mailer, log: quiet });
    assert.deepEqual(r.events, []);
    assert.equal(mailer.sent.length, 2);
    assert.deepEqual(github.calls.map((c) => c[0]), ['open', 'comment', 'close']);
  } finally {
    await srv.stop();
  }
});

test('a single blip never alerts', async () => {
  const srv = fakeServer();
  const url = await srv.start();
  const checks = [{ name: 'Blip', url, expect: (r) => r.json?.db === 'ok' }];
  const github = fakeGithub();
  const mailer = fakeMailer();
  try {
    srv.set('down');
    let { state } = await runOnce({ checks, state: {}, github, mailer, log: quiet });
    srv.set('up');
    ({ state } = await runOnce({ checks, state, github, mailer, log: quiet }));
    srv.set('down');
    ({ state } = await runOnce({ checks, state, github, mailer, log: quiet }));
    assert.equal(state.checks.Blip.fails, 1);
    assert.equal(github.issues.length, 0);
    assert.equal(mailer.sent.length, 0);
  } finally {
    await srv.stop();
  }
});

test('lost state never duplicates an alert: the open issue wins', async () => {
  const srv = fakeServer();
  const url = await srv.start();
  const checks = [{ name: 'Sticky', url }];
  const github = fakeGithub();
  const mailer = fakeMailer();
  try {
    await github.openIssue('DOWN: Sticky', 'x');
    srv.set('down');
    const r = await runOnce({ checks, state: {}, github, mailer, log: quiet });
    assert.equal(r.events[0].type, 'still_down');
    assert.equal(github.issues.length, 1);
    assert.equal(mailer.sent.length, 0);
  } finally {
    await srv.stop();
  }
});

test('TLS expiry threshold is 14 days', async () => {
  const now = new Date('2026-09-29T00:00:00Z');
  const expiring = (days, hostnameError = null) => async () => ({
    validTo: new Date(now.getTime() + days * 86_400_000),
    hostnameError,
  });
  const check = { name: 'TLS x', tls: { host: 'x.example' } };
  assert.equal((await probeTls(check, { now, readExpiry: expiring(30) })).ok, true);
  assert.equal((await probeTls(check, { now, readExpiry: expiring(14) })).ok, true);
  const soon = await probeTls(check, { now, readExpiry: expiring(13) });
  assert.equal(soon.ok, false);
  assert.match(soon.error, /expires in 13 days \(2026-10-12\)/);
  assert.match((await probeTls(check, { now, readExpiry: expiring(-1) })).error, /expired on/);
  assert.match((await probeTls(check, { now, readExpiry: expiring(60, 'bad host') })).error, /does not match/);
  const refused = await probeTls(check, { now, readExpiry: async () => { throw Object.assign(new Error('x'), { code: 'ECONNREFUSED' }); } });
  assert.match(refused.error, /ECONNREFUSED/);
});

test('emails use the light layout and footer, never the legal name or a street address', () => {
  const d = downEmail({
    check: 'Hookpost API health',
    target: 'https://hookpost.hookstep.in/api/health',
    error: 'HTTP 503',
    firstFailedAt: new Date('2026-09-29T10:00:00Z'),
    issueUrl: 'https://github.com/jatinder14/hookpost/issues/9',
  });
  const u = recoveredEmail({
    check: 'Hookpost API health',
    target: 'https://hookpost.hookstep.in/api/health',
    minutes: 12,
    recoveredAt: new Date('2026-09-29T10:12:00Z'),
    issueUrl: 'https://github.com/jatinder14/hookpost/issues/9',
  });
  for (const e of [d, u]) {
    assert.equal(FOOTER_LINE, 'Hookstep · Ghatkopar, Mumbai, India');
    assert.ok(e.html.includes(FOOTER_LINE) && e.text.includes(FOOTER_LINE));
    assert.ok(!/Hookstep/i.test(e.html + e.text));
    assert.ok(!/Road|Marg|Nagar|Lane|400\d{3}/.test(e.html + e.text));
    assert.ok(e.html.includes('#F6F8FB'));
    assert.ok(e.text.includes('IST'));
    assert.ok(e.html.includes('issues/9'));
  }
  assert.match(u.text, /recovered after 12 min/);
});
