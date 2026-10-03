// The Google Play app (in.hookstep.hookpost.twa) is a Trusted Web Activity:
// Chrome showing this same site full screen. Nothing switches the site to Play
// Billing on its own, so before this file the Play app showed new FREE users
// the Razorpay plans screen, and Play's Payments policy forbids selling a SaaS
// plan inside a Play app through anything but Play Billing. The app is now
// consumption-only: inside it the paywall, the Billing menu, every upgrade
// prompt and Razorpay itself are switched off, and at most a plain, unlinked
// "Manage your plan on hookpost.hookstep.in" is shown. The website and the
// installed PWA keep Razorpay exactly as before.
//
// No 'use client' here on purpose: the layouts (server components) inline
// TWA_BOOTSTRAP_SCRIPT, and a string exported from a client module would reach
// them as a client reference, not as the string.
//
// How the Play app is recognised. Chrome opens a TWA's first page with
// document.referrer = 'android-app://in.hookstep.hookpost.twa'. That is only
// true of the first document - the logged-in redirect from / to /launches and
// every later navigation lose it - so the first sighting is persisted in
// localStorage and in a cookie (the cookie so server components can read it).
// ?source=twa is accepted too, for a future build whose launchUrl carries it.
//
// Known trade-off: a TWA shares Chrome's storage for this origin, so once the
// Play app has been opened, plain Chrome on the same phone is treated as the
// Play app as well and offers no checkout. That errs on the policy-safe side.
// ?source=web clears the flag on that device.

export const TWA_PACKAGE = 'in.hookstep.hookpost.twa';
export const TWA_REFERRER_PREFIX = `android-app://${TWA_PACKAGE}`;
export const TWA_STORAGE_KEY = 'hookpost_twa';
export const TWA_COOKIE = 'hookpost_twa';
/** Set on <html> by TWA_BOOTSTRAP_SCRIPT; CSS hides `.hp-hide-in-twa` under it. */
export const TWA_HTML_ATTR = 'data-hp-twa';
export const TWA_HIDE_CLASS = 'hp-hide-in-twa';

/** The only thing the Play app may say where a paywall used to be. Unlinked. */
export const TWA_PLAN_NOTICE = 'Manage your plan on hookpost.hookstep.in';

export const PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${TWA_PACKAGE}`;

/**
 * Play listing URL with an install-referrer tag, so installs from each badge
 * show up separately in Play Console's acquisition report.
 */
export const playStoreUrl = (medium: string) =>
  `${PLAY_STORE_URL}&referrer=${encodeURIComponent(
    `utm_source=site&utm_medium=${medium}`
  )}`;

/**
 * The Play app's own package, exactly: android-app://in.hookstep.hookpost.twa
 * with an optional path. A bare prefix test would also accept a sibling
 * package such as in.hookstep.hookpost.twa2.
 */
export const isTwaReferrer = (referrer: string): boolean => {
  const r = referrer || '';
  return r === TWA_REFERRER_PREFIX || r.indexOf(`${TWA_REFERRER_PREFIX}/`) === 0;
};

/** True when this page load is the Play app's launch (referrer or ?source=twa). */
export const detectTwaLaunch = (referrer: string, search: string): boolean => {
  if (isTwaReferrer(referrer)) {
    return true;
  }
  return new URLSearchParams(search || '').get('source') === 'twa';
};

export const hasTwaCookie = (cookie: string): boolean =>
  (cookie || '')
    .split(';')
    .some((c) => c.trim() === `${TWA_COOKIE}=1`);

/**
 * Client-side read: is this browser the Play app? Safe to call anywhere; it is
 * false on the server and never throws.
 */
export const isTwaClient = (): boolean => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return false;
  }
  try {
    if (document.documentElement.hasAttribute(TWA_HTML_ATTR)) {
      return true;
    }
    // Normally the bootstrap script has already run and set the attribute.
    // These are the fallbacks for a page where it did not.
    if (detectTwaLaunch(document.referrer, window.location.search)) {
      return true;
    }
    if (window.localStorage.getItem(TWA_STORAGE_KEY) === '1') {
      return true;
    }
  } catch (e) {
    // localStorage can throw (blocked storage); fall through to the cookie.
  }
  return hasTwaCookie(document.cookie);
};

/**
 * Inlined in <head> by (landing)/layout.tsx and (app)/layout.tsx so it runs
 * before anything renders and before the landing page's signed-in redirect:
 * detects the launch, persists it, and marks <html>. Plain ES5 on purpose - it
 * is not compiled. Mirrors detectTwaLaunch/isTwaClient; twa.spec.ts runs this
 * exact string against both.
 */
export const TWA_BOOTSTRAP_SCRIPT = `(function () {
  try {
    var key = ${JSON.stringify(TWA_STORAGE_KEY)};
    var cookieName = ${JSON.stringify(TWA_COOKIE)};
    var html = document.documentElement;
    var source = (window.location.search.match(/[?&]source=([^&#]*)/) || [])[1];
    var secure = window.location.protocol === 'https:' ? '; Secure' : '';
    if (source === 'web') {
      try { window.localStorage.removeItem(key); } catch (e) {}
      document.cookie = cookieName + '=; path=/; max-age=0; SameSite=Lax' + secure;
      html.removeAttribute(${JSON.stringify(TWA_HTML_ATTR)});
      return;
    }
    var ref = document.referrer || '';
    var pkg = ${JSON.stringify(TWA_REFERRER_PREFIX)};
    var twa = ref === pkg || ref.indexOf(pkg + '/') === 0 || source === 'twa';
    if (!twa) {
      try { twa = window.localStorage.getItem(key) === '1'; } catch (e) {}
    }
    if (!twa) {
      twa = (';' + document.cookie).replace(/\\s/g, '').indexOf(';' + cookieName + '=1') !== -1;
    }
    if (!twa) return;
    try { window.localStorage.setItem(key, '1'); } catch (e) {}
    document.cookie = cookieName + '=1; path=/; max-age=31536000; SameSite=Lax' + secure;
    var attr = ${JSON.stringify(TWA_HTML_ATTR)};
    html.setAttribute(attr, '');
    // A hydration mismatch makes React re-render the whole document on the
    // client, and that drops attributes it did not render, this one included
    // (seen on /auth in local testing). The CSS that hides the Play badges
    // keys off the attribute, so put it back whenever it disappears.
    if (typeof MutationObserver === 'function') {
      new MutationObserver(function () {
        if (!html.hasAttribute(attr)) html.setAttribute(attr, '');
      }).observe(html, { attributes: true, attributeFilter: [attr] });
    }
  } catch (e) {}
})();`;

/**
 * Marketing pages whose point is prices or a plan sale. The Play app's own
 * links to them are hidden (site nav and footer), but Android opens any link to
 * this domain in the Play app once it is installed - an email's "see pricing"
 * link, for one - so inside the app they go to /auth as well. Exact paths and
 * everything under them.
 */
export const TWA_PRICED_PAGES = [
  '/pricing',
  '/free-social-media-scheduler',
  '/social-media-scheduler-india',
  '/best-social-media-scheduler-india',
  '/affiliates',
  '/alternatives',
  '/compare',
  '/vs',
];

/**
 * Inlined in (landing)/layout.tsx right after TWA_BOOTSTRAP_SCRIPT. The Play
 * app starts at /, the marketing homepage, which lists the web prices and says
 * payment goes through Razorpay. Inside the Play app that is messaging about
 * another way to pay, which Play's Payments policy does not allow, so there /
 * goes straight to /auth: sign-up, and the middleware forwards a signed-in
 * user on to /launches. The same for TWA_PRICED_PAGES. Every other marketing
 * page (policies, docs, free tools) is left alone. Plain ES5, like the
 * bootstrap.
 */
export const TWA_HOME_REDIRECT_SCRIPT = `(function () {
  try {
    if (!document.documentElement.hasAttribute(${JSON.stringify(TWA_HTML_ATTR)})) return;
    var path = window.location.pathname;
    var priced = ${JSON.stringify(TWA_PRICED_PAGES)};
    var hit = path === '/';
    for (var i = 0; !hit && i < priced.length; i++) {
      hit = path === priced[i] || path.indexOf(priced[i] + '/') === 0;
    }
    if (hit) {
      window.location.replace('/auth' + window.location.search);
    }
  } catch (e) {}
})();`;

const TWA_LIMIT_FALLBACK = 'You have reached a limit of your plan.';

/**
 * A plan-limit message as the Play app may show it: what the limit is, but not
 * how to buy past it. The backend's 402 messages end with a sentence such as
 * "Upgrade to Standard to get 500 posts a month." or "Start a 7-day free trial
 * of Standard ...", so any sentence about upgrading, a trial or buying is
 * dropped. No lookbehind in the regex: older Safari cannot parse it, and this
 * module ships in the main app bundle.
 */
export const twaLimitMessage = (message: unknown): string => {
  if (typeof message !== 'string') {
    return TWA_LIMIT_FALLBACK;
  }
  const kept = (message.match(/[^.!?]+(?:[.!?]+|$)/g) || [])
    .map((s) => s.trim())
    .filter((s) => s && !/\b(upgrade|trial|buy|purchase|checkout)/i.test(s));
  return kept.length ? kept.join(' ') : TWA_LIMIT_FALLBACK;
};

/** Hides anything marked TWA_HIDE_CLASS inside the Play app, with no flash. */
export const TWA_HIDE_CSS = `html[${TWA_HTML_ATTR}] .${TWA_HIDE_CLASS} { display: none !important; }`;

/**
 * Whether a signed-in user gets the full-screen first-billing paywall
 * (FirstBillingComponent) instead of the app. Never inside the Play app.
 */
export const showFirstBilling = (p: {
  tier?: string;
  admin?: boolean;
  isGeneral: boolean;
  billingEnabled: boolean;
  continueFree: boolean;
  isTwa: boolean;
}): boolean =>
  p.tier === 'FREE' &&
  p.isGeneral &&
  p.billingEnabled &&
  !p.admin &&
  !p.continueFree &&
  !p.isTwa;
