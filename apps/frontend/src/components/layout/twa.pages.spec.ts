/**
 * Pages that quote web plan prices or upsell a package must not render inside
 * the Google Play app, and must be unchanged outside it.
 *   pnpm exec jest -c apps/frontend/jest.config.ts
 */
import React from 'react';
import { act, render } from '@testing-library/react';

const mockFetch = jest.fn(async () => ({ json: async () => ({ affiliate: null }) }));
const mockUseUser = jest.fn(() => undefined);
jest.mock('@hookpost/helpers/utils/custom.fetch', () => ({
  useFetch: () => mockFetch,
}));
jest.mock('@hookpost/react/toaster/toaster', () => ({
  useToaster: () => ({ show: jest.fn() }),
}));
jest.mock('@hookpost/frontend/components/layout/loading', () => ({
  LoadingComponent: () => 'loading',
}));
jest.mock('@hookpost/frontend/components/layout/new-modal', () => ({
  areYouSure: jest.fn(),
}));
jest.mock('@hookpost/frontend/components/layout/user.context', () => ({
  useUser: () => mockUseUser(),
}));
jest.mock('@hookpost/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback: string) => fallback,
}));
jest.mock('@hookpost/react/form/input', () => ({ Input: () => null }));
jest.mock('@hookpost/react/form/button', () => ({ Button: () => null }));
jest.mock('@hookpost/helpers/utils/use.fire.events', () => ({
  useFireEvents: () => jest.fn(),
}));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
}));
jest.mock('swr', () => {
  const actual = jest.requireActual('swr');
  return { __esModule: true, ...actual, useSWRConfig: () => ({ mutate: jest.fn() }) };
});

import { AffiliateComponent } from '@hookpost/frontend/components/affiliates/affiliate.component';
import { LifetimeDeal } from '@hookpost/frontend/components/billing/lifetime.deal';
import {
  TWA_BOOTSTRAP_SCRIPT,
  TWA_COOKIE,
  TWA_HTML_ATTR,
  TWA_PLAN_NOTICE,
} from '@hookpost/frontend/components/layout/twa';
import {
  endPageLoad,
  trackObservers,
} from '@hookpost/frontend/components/layout/twa.testing';

trackObservers();

const launch = (referrer: string) => {
  endPageLoad();
  window.localStorage.clear();
  document.cookie = `${TWA_COOKIE}=; path=/; max-age=0`;
  document.documentElement.removeAttribute(TWA_HTML_ATTR);
  Object.defineProperty(document, 'referrer', { value: referrer, configurable: true });
  new Function(TWA_BOOTSTRAP_SCRIPT)();
};

beforeEach(() => {
  mockFetch.mockClear();
  mockUseUser.mockClear();
});

describe('inside the Play app', () => {
  beforeEach(() => launch('android-app://in.hookstep.hookpost.twa'));

  it('the affiliate page is only the plain plan line, and fetches nothing', () => {
    const { container } = render(React.createElement(AffiliateComponent));
    expect(container.textContent).toBe(TWA_PLAN_NOTICE);
    expect(container.querySelector('a')).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('the lifetime page shows no package upsell', () => {
    const { container } = render(React.createElement(LifetimeDeal));
    expect(container.textContent).toBe(TWA_PLAN_NOTICE);
    expect(mockUseUser).not.toHaveBeenCalled();
  });
});

describe('in a normal browser', () => {
  beforeEach(() => launch('https://www.google.com/'));

  it('the affiliate page still loads its data', async () => {
    await act(async () => {
      render(React.createElement(AffiliateComponent));
    });
    expect(mockFetch).toHaveBeenCalledWith('/affiliates/me');
  });

  it('the lifetime page still runs', () => {
    render(React.createElement(LifetimeDeal));
    expect(mockUseUser).toHaveBeenCalled();
  });
});
