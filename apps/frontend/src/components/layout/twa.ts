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

/** True when this page load is the Play app's launch (referrer or ?source=twa). */
export const detectTwaLaunch = (referrer: string, search: string): boolean => {
  if ((referrer || '').indexOf(TWA_REFERRER_PREFIX) === 0) {
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
    var twa =
      (document.referrer || '').indexOf(${JSON.stringify(TWA_REFERRER_PREFIX)}) === 0 ||
      source === 'twa';
    if (!twa) {
      try { twa = window.localStorage.getItem(key) === '1'; } catch (e) {}
    }
    if (!twa) {
      twa = (';' + document.cookie).replace(/\\s/g, '').indexOf(';' + cookieName + '=1') !== -1;
    }
    if (!twa) return;
    try { window.localStorage.setItem(key, '1'); } catch (e) {}
    document.cookie = cookieName + '=1; path=/; max-age=31536000; SameSite=Lax' + secure;
    html.setAttribute(${JSON.stringify(TWA_HTML_ATTR)}, '');
  } catch (e) {}
})();`;

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
