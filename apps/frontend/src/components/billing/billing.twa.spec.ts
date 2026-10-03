/**
 * Inside the Google Play app nothing may reach Razorpay: no plans screen, no
 * checkout.js, no subscription created. Outside it, billing is unchanged.
 *   pnpm exec jest -c apps/frontend/jest.config.ts
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

const mockFetch = jest.fn(async (path: string) => ({
  json: async () =>
    path === '/user/subscription' ? { subscription: undefined } : {},
}));
jest.mock('@hookpost/helpers/utils/custom.fetch', () => ({
  useFetch: () => mockFetch,
}));
jest.mock('@hookpost/frontend/components/billing/main.billing.component', () => ({
  MainBillingComponent: () => 'PLANS AND CHECKOUT',
}));
jest.mock('@hookpost/frontend/components/layout/loading', () => ({
  LoadingComponent: () => 'loading',
}));
jest.mock('@hookpost/frontend/components/layout/new-modal', () => ({
  areYouSure: jest.fn(),
}));
jest.mock('@hookpost/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback: string) => fallback,
}));
jest.mock('@hookpost/react/form/button', () => ({ Button: () => null }));

import { BillingComponent } from '@hookpost/frontend/components/billing/billing.component';
import {
  loadRazorpayScript,
  openRazorpayCheckout,
} from '@hookpost/frontend/components/billing/razorpay.billing';
import {
  TWA_BOOTSTRAP_SCRIPT,
  TWA_COOKIE,
  TWA_HTML_ATTR,
  TWA_PLAN_NOTICE,
} from '@hookpost/frontend/components/layout/twa';

const CHECKOUT_JS = 'script[src="https://checkout.razorpay.com/v1/checkout.js"]';

const launch = (referrer: string) => {
  window.localStorage.clear();
  document.cookie = `${TWA_COOKIE}=; path=/; max-age=0`;
  document.documentElement.removeAttribute(TWA_HTML_ATTR);
  document.querySelectorAll(CHECKOUT_JS).forEach((s) => s.remove());
  Object.defineProperty(document, 'referrer', {
    value: referrer,
    configurable: true,
  });
  new Function(TWA_BOOTSTRAP_SCRIPT)();
};

beforeEach(() => mockFetch.mockClear());

describe('inside the Play app', () => {
  beforeEach(() => launch('android-app://in.hookstep.hookpost.twa'));

  it('/billing shows only the plain plan line, and fetches nothing', () => {
    const { container } = render(React.createElement(BillingComponent));
    expect(container.textContent).toBe(TWA_PLAN_NOTICE);
    expect(container.querySelector('a')).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('never loads checkout.js or opens Razorpay', async () => {
    await expect(loadRazorpayScript()).resolves.toBe(false);
    const verify = jest.fn();
    await expect(
      openRazorpayCheckout({ subscriptionId: 'sub_x', verify })
    ).resolves.toBe(false);
    expect(document.querySelector(CHECKOUT_JS)).toBeNull();
    expect(verify).not.toHaveBeenCalled();
  });
});

describe('in a normal browser', () => {
  beforeEach(() => launch('https://www.google.com/'));

  it('/billing still loads the plans and checkout', async () => {
    render(React.createElement(BillingComponent));
    expect(await screen.findByText('PLANS AND CHECKOUT')).toBeTruthy();
    expect(mockFetch).toHaveBeenCalledWith('/user/subscription');
  });

  it('still loads checkout.js', async () => {
    void loadRazorpayScript();
    await waitFor(() =>
      expect(document.querySelector(CHECKOUT_JS)).not.toBeNull()
    );
  });
});
