/**
 * Google Play app (TWA) detection, and the paywall decision that depends on it.
 *   pnpm exec jest -c apps/frontend/jest.config.ts
 *
 * The bootstrap tests run the exact inline-script string the layouts ship,
 * against a jsdom page whose document.referrer is set the way Chrome sets it
 * when the Play app opens the site.
 */
import React from 'react';
import { act, render } from '@testing-library/react';

jest.mock('@hookpost/frontend/components/layout/new-modal', () => ({
  areYouSure: jest.fn(() => Promise.resolve(true)),
}));

import { areYouSure } from '@hookpost/frontend/components/layout/new-modal';
import {
  detectTwaLaunch,
  hasTwaCookie,
  isTwaClient,
  PLAY_STORE_URL,
  playStoreUrl,
  showFirstBilling,
  TWA_BOOTSTRAP_SCRIPT,
  TWA_COOKIE,
  TWA_HOME_REDIRECT_SCRIPT,
  TWA_HTML_ATTR,
  TWA_PLAN_NOTICE,
  TWA_PRICED_PAGES,
  TWA_STORAGE_KEY,
  twaLimitMessage,
} from '@hookpost/frontend/components/layout/twa';
import {
  twaPlanDialog,
  useIsTwa,
} from '@hookpost/frontend/components/layout/twa.component';

import {
  endPageLoad,
  trackObservers,
} from '@hookpost/frontend/components/layout/twa.testing';

trackObservers();

const PLAY_REFERRER = 'android-app://in.hookstep.hookpost.twa';

const setReferrer = (value: string) =>
  Object.defineProperty(document, 'referrer', {
    value,
    configurable: true,
  });

const setUrl = (pathAndQuery: string) =>
  window.history.replaceState({}, '', pathAndQuery);

/** A fresh browser: no flag anywhere, no referrer, at /. */
const freshBrowser = () => {
  window.localStorage.clear();
  document.cookie = `${TWA_COOKIE}=; path=/; max-age=0`;
  newPageLoad('', '/');
};

/** A new document in the same browser: storage and cookies survive. */
const newPageLoad = (referrer: string, pathAndQuery: string) => {
  endPageLoad();
  document.documentElement.removeAttribute(TWA_HTML_ATTR);
  setReferrer(referrer);
  setUrl(pathAndQuery);
};

const runBootstrap = () => new Function(TWA_BOOTSTRAP_SCRIPT)();

// The paywall inputs for a new FREE, non-admin user on production
// (IS_GENERAL set, a Razorpay key present, "Start free" not pressed).
const freeUserOnProd = {
  tier: 'FREE',
  admin: false,
  isGeneral: true,
  billingEnabled: true,
  continueFree: false,
};

beforeEach(freshBrowser);

describe('detectTwaLaunch', () => {
  it.each([
    [PLAY_REFERRER, '', true],
    [`${PLAY_REFERRER}/`, '', true],
    ['android-app://com.android.chrome/', '', false],
    ['android-app://in.hookstep.tablamigo/', '', false],
    // A sibling package must not count as the Play app.
    ['android-app://in.hookstep.hookpost.twa2/', '', false],
    ['android-app://in.hookstep.hookpost.twa.evil', '', false],
    [`${PLAY_REFERRER}/https/hookpost.hookstep.in`, '', true],
    ['https://hookpost.hookstep.in/', '', false],
    ['https://www.google.com/', '', false],
    ['', '', false],
    ['', '?source=twa', true],
    ['', '?utm_source=site&source=twa', true],
    ['', '?utm_source=twa', false],
    ['', '?source=web', false],
  ])('referrer %j, search %j -> %s', (referrer, search, expected) => {
    expect(detectTwaLaunch(referrer, search)).toBe(expected);
  });
});

describe('hasTwaCookie', () => {
  it('matches only the exact cookie', () => {
    expect(hasTwaCookie('a=1; hookpost_twa=1; b=2')).toBe(true);
    expect(hasTwaCookie('hookpost_twa=1')).toBe(true);
    expect(hasTwaCookie('hookpost_twa=0')).toBe(false);
    expect(hasTwaCookie('xhookpost_twa=1')).toBe(false);
    expect(hasTwaCookie('')).toBe(false);
  });
});

describe('TWA_BOOTSTRAP_SCRIPT (the inline script in both layouts)', () => {
  it('marks and persists the Play app launch', () => {
    newPageLoad(PLAY_REFERRER, '/');
    runBootstrap();

    expect(document.documentElement.hasAttribute(TWA_HTML_ATTR)).toBe(true);
    expect(window.localStorage.getItem(TWA_STORAGE_KEY)).toBe('1');
    expect(hasTwaCookie(document.cookie)).toBe(true);
    expect(isTwaClient()).toBe(true);
  });

  it('does nothing in a normal browser', () => {
    newPageLoad('https://www.google.com/', '/');
    runBootstrap();

    expect(document.documentElement.hasAttribute(TWA_HTML_ATTR)).toBe(false);
    expect(window.localStorage.getItem(TWA_STORAGE_KEY)).toBeNull();
    expect(hasTwaCookie(document.cookie)).toBe(false);
    expect(isTwaClient()).toBe(false);
  });

  it('remembers the Play app after the referrer is gone (/ -> /launches)', () => {
    newPageLoad(PLAY_REFERRER, '/');
    runBootstrap();

    newPageLoad('', '/launches');
    expect(isTwaClient()).toBe(true); // storage alone, before the script
    runBootstrap();
    expect(document.documentElement.hasAttribute(TWA_HTML_ATTR)).toBe(true);
  });

  it('restores localStorage from the cookie, and the cookie from localStorage', () => {
    newPageLoad(PLAY_REFERRER, '/');
    runBootstrap();

    window.localStorage.clear();
    newPageLoad('', '/launches');
    runBootstrap();
    expect(window.localStorage.getItem(TWA_STORAGE_KEY)).toBe('1');

    document.cookie = `${TWA_COOKIE}=; path=/; max-age=0`;
    newPageLoad('', '/billing');
    runBootstrap();
    expect(hasTwaCookie(document.cookie)).toBe(true);
  });

  it('accepts ?source=twa, and ?source=web clears every trace', () => {
    newPageLoad('', '/launches?source=twa');
    runBootstrap();
    expect(isTwaClient()).toBe(true);

    newPageLoad('', '/?source=web');
    runBootstrap();
    expect(document.documentElement.hasAttribute(TWA_HTML_ATTR)).toBe(false);
    expect(window.localStorage.getItem(TWA_STORAGE_KEY)).toBeNull();
    expect(hasTwaCookie(document.cookie)).toBe(false);
    newPageLoad('', '/launches');
    expect(isTwaClient()).toBe(false);
  });

  it('puts the flag back if a hydration re-render strips it from <html>', async () => {
    newPageLoad(PLAY_REFERRER, '/auth');
    runBootstrap();
    document.documentElement.removeAttribute(TWA_HTML_ATTR);
    await Promise.resolve();
    await Promise.resolve();
    expect(document.documentElement.hasAttribute(TWA_HTML_ATTR)).toBe(true);
  });

  it('does not fight ?source=web, and sets no observer in a normal browser', async () => {
    newPageLoad('', '/?source=web');
    runBootstrap();
    document.documentElement.setAttribute(TWA_HTML_ATTR, '');
    document.documentElement.removeAttribute(TWA_HTML_ATTR);
    await Promise.resolve();
    expect(document.documentElement.hasAttribute(TWA_HTML_ATTR)).toBe(false);
  });

  it.each([
    [PLAY_REFERRER, '/'],
    [`${PLAY_REFERRER}/`, '/launches'],
    ['android-app://com.android.chrome/', '/'],
    ['android-app://in.hookstep.hookpost.twa2/', '/'],
    ['https://www.google.com/', '/'],
    ['', '/?source=twa'],
    ['', '/?utm_source=twa'],
    ['', '/'],
  ])('agrees with detectTwaLaunch for referrer %j at %s', (referrer, url) => {
    newPageLoad(referrer, url);
    runBootstrap();
    expect(document.documentElement.hasAttribute(TWA_HTML_ATTR)).toBe(
      detectTwaLaunch(referrer, window.location.search)
    );
  });
});

describe('the Razorpay paywall (layout.component.tsx)', () => {
  it('is shown to a FREE user in a normal browser', () => {
    newPageLoad('https://www.google.com/', '/');
    runBootstrap();
    newPageLoad('', '/launches');
    runBootstrap();

    expect(showFirstBilling({ ...freeUserOnProd, isTwa: isTwaClient() })).toBe(
      true
    );
  });

  it('is hidden from the same user opening the Play app', () => {
    newPageLoad(PLAY_REFERRER, '/');
    runBootstrap();
    newPageLoad('', '/launches');
    runBootstrap();

    expect(showFirstBilling({ ...freeUserOnProd, isTwa: isTwaClient() })).toBe(
      false
    );
  });

  it('keeps its existing rules outside the Play app', () => {
    const web = { ...freeUserOnProd, isTwa: false };
    expect(showFirstBilling({ ...web, tier: 'STANDARD' })).toBe(false);
    expect(showFirstBilling({ ...web, admin: true })).toBe(false);
    expect(showFirstBilling({ ...web, continueFree: true })).toBe(false);
    expect(showFirstBilling({ ...web, billingEnabled: false })).toBe(false);
    expect(showFirstBilling({ ...web, isGeneral: false })).toBe(false);
  });
});

describe('useIsTwa', () => {
  const Probe = () => React.createElement('div', null, useIsTwa() ? 'twa' : 'web');

  it('is true after a Play app launch', () => {
    newPageLoad(PLAY_REFERRER, '/');
    runBootstrap();
    const { container } = render(React.createElement(Probe));
    expect(container.textContent).toBe('twa');
  });

  it('is false in a normal browser', () => {
    runBootstrap();
    const { container } = render(React.createElement(Probe));
    expect(container.textContent).toBe('web');
  });
});

describe('twaPlanDialog', () => {
  it('offers only OK, with the plain plan line and no link', async () => {
    await act(async () => {
      await twaPlanDialog('You have reached a limit of your plan.');
    });
    const call = (areYouSure as jest.Mock).mock.calls[0][0];
    expect(call.onlyApprove).toBe(true);
    expect(call.approveLabel).toBe('OK');
    const { container } = render(call.description);
    expect(container.textContent).toContain(TWA_PLAN_NOTICE);
    expect(container.querySelector('a')).toBeNull();
  });
});

describe('Play listing URLs', () => {
  it('point at the Hookpost listing, with a referrer per placement', () => {
    expect(PLAY_STORE_URL).toBe(
      'https://play.google.com/store/apps/details?id=in.hookstep.hookpost.twa'
    );
    const url = new URL(playStoreUrl('hero'));
    expect(url.searchParams.get('id')).toBe('in.hookstep.hookpost.twa');
    expect(url.searchParams.get('referrer')).toBe(
      'utm_source=site&utm_medium=hero'
    );
  });
});

describe('TWA_HOME_REDIRECT_SCRIPT (the Play app skips the marketing homepage)', () => {
  // jsdom cannot navigate, so the script runs against a stand-in `window`
  // whose location records the replace() call. `document` is the real one.
  const runRedirect = (pathname: string, search = '') => {
    const replace = jest.fn();
    new Function('window', TWA_HOME_REDIRECT_SCRIPT)({
      location: { pathname, search, replace },
    });
    return replace;
  };

  it('sends the Play app from / to /auth, keeping the query string', () => {
    newPageLoad(PLAY_REFERRER, '/');
    runBootstrap();
    expect(runRedirect('/')).toHaveBeenCalledWith('/auth');
    expect(runRedirect('/', '?utm_source=x')).toHaveBeenCalledWith(
      '/auth?utm_source=x'
    );
  });

  it('leaves every other page alone, even in the Play app', () => {
    newPageLoad(PLAY_REFERRER, '/');
    runBootstrap();
    for (const path of [
      '/privacy',
      '/terms',
      '/refund-policy',
      '/docs',
      '/auth',
      '/tools/character-counter',
      '/pricingx',
      '/vsx',
    ]) {
      expect(runRedirect(path)).not.toHaveBeenCalled();
    }
  });

  it('sends the priced marketing pages to /auth too (an email link opens in the app)', () => {
    newPageLoad(PLAY_REFERRER, '/');
    runBootstrap();
    for (const path of TWA_PRICED_PAGES.concat(['/alternatives/buffer', '/vs/zoho-social'])) {
      expect(runRedirect(path)).toHaveBeenCalledWith('/auth');
    }
    expect(runRedirect('/pricing', '?utm_source=email')).toHaveBeenCalledWith(
      '/auth?utm_source=email'
    );
  });

  it('leaves the priced pages alone in a normal browser', () => {
    newPageLoad('https://www.google.com/', '/pricing');
    runBootstrap();
    for (const path of TWA_PRICED_PAGES) {
      expect(runRedirect(path)).not.toHaveBeenCalled();
    }
  });

  it('never redirects a normal browser', () => {
    newPageLoad('https://www.google.com/', '/');
    runBootstrap();
    expect(runRedirect('/')).not.toHaveBeenCalled();
  });

  it('stops redirecting after ?source=web', () => {
    newPageLoad(PLAY_REFERRER, '/');
    runBootstrap();
    newPageLoad('', '/?source=web');
    runBootstrap();
    expect(runRedirect('/', '?source=web')).not.toHaveBeenCalled();
  });
});

describe('twaLimitMessage (402 dialogs inside the Play app)', () => {
  // The shapes the backend sends: SubscriptionExceptionFilter for Free and
  // paid workspaces, and IntegrationService's channel-count check.
  it.each([
    [
      'The Free plan includes 5 channels. Upgrade to Standard to get up to 10 channels.',
      'The Free plan includes 5 channels.',
    ],
    [
      'The Free plan includes 5 channels. Start a 7-day free trial of Standard to get up to 10 channels - no charge until the trial ends, cancel anytime.',
      'The Free plan includes 5 channels.',
    ],
    [
      "You've used all 30 posts on the Free plan this month. Upgrade to Standard to get 500 posts a month.",
      "You've used all 30 posts on the Free plan this month.",
    ],
    [
      'You have reached the maximum number of posts for your subscription. Please upgrade your subscription to add more posts.',
      'You have reached the maximum number of posts for your subscription.',
    ],
    [
      'Your plan allows 5 channels and 5 are in use, so you can add 0 more. You selected 2.',
      'Your plan allows 5 channels and 5 are in use, so you can add 0 more. You selected 2.',
    ],
  ])('%j -> %j', (message, expected) => {
    expect(twaLimitMessage(message)).toBe(expected);
  });

  it('falls back to a plain line when nothing is left, or there is no message', () => {
    expect(twaLimitMessage('Upgrade to keep going.')).toBe(
      'You have reached a limit of your plan.'
    );
    expect(twaLimitMessage(undefined)).toBe(
      'You have reached a limit of your plan.'
    );
    expect(twaLimitMessage({ section: 'channel' })).toBe(
      'You have reached a limit of your plan.'
    );
  });
});
