import 'reflect-metadata';
import { SubscriptionService } from '@hookpost/nestjs-libraries/database/prisma/subscriptions/subscription.service';
import { RazorpayService } from '@hookpost/nestjs-libraries/services/razorpay.service';
import { LAUNCH50 } from '../../../../scripts/create-launch50';

// Only injection tokens for the two services under test; the real modules
// pull in Prisma, Redis and storage clients.
jest.mock(
  '@hookpost/nestjs-libraries/database/prisma/affiliates/affiliate.repository',
  () => ({ AffiliateRepository: class {} })
);
jest.mock(
  '@hookpost/nestjs-libraries/database/prisma/subscriptions/subscription.repository',
  () => ({ SubscriptionRepository: class {} })
);
jest.mock(
  '@hookpost/nestjs-libraries/database/prisma/integrations/integration.service',
  () => ({ IntegrationService: class {} })
);
jest.mock(
  '@hookpost/nestjs-libraries/database/prisma/organizations/organization.service',
  () => ({ OrganizationService: class {} })
);
jest.mock('@hookpost/nestjs-libraries/database/prisma/users/users.service', () => ({
  UsersService: class {},
}));
jest.mock('@hookpost/nestjs-libraries/track/track.service', () => ({
  TrackService: class {},
}));
jest.mock(
  '@hookpost/nestjs-libraries/database/prisma/affiliates/affiliate.service',
  () => ({ AffiliateService: class {} })
);

const mockRequest = jest.fn();
jest.mock('@hookpost/nestjs-libraries/services/razorpay.client', () => ({
  RazorpayClient: jest.fn().mockImplementation(() => ({ request: mockRequest })),
}));

// The row scripts/create-launch50.ts writes, as Prisma returns it.
const launch50Row = {
  id: 'coupon-launch50',
  active: true,
  createdAt: new Date('2026-09-29'),
  ...LAUNCH50,
};

const setup = (redemptions = 0) => {
  const repo = {
    findCouponByCode: jest.fn(async (code: string) =>
      code === 'LAUNCH50' ? launch50Row : null
    ),
    countCouponRedemptions: jest.fn(async () => redemptions),
    hasRedeemedCoupon: jest.fn(async () => false),
    getSubscription: jest.fn(async () => null),
    updateCustomerId: jest.fn(),
  };
  const subscriptions = new SubscriptionService(
    repo as any,
    {} as any,
    {} as any,
    {} as any
  );
  const organizations = {
    getOrgById: jest.fn(async (id: string) => ({ id, paymentId: 'cust_1' })),
  };
  const razorpay = new RazorpayService(
    subscriptions,
    organizations as any,
    {} as any,
    {} as any,
    {} as any
  );

  const created: { plans: any[]; subscriptions: any[] } = {
    plans: [],
    subscriptions: [],
  };
  mockRequest.mockReset();
  mockRequest.mockImplementation(async (method: string, path: string, body: any) => {
    if (method === 'GET' && path.startsWith('/plans')) return { items: [] };
    if (method === 'POST' && path === '/plans') {
      created.plans.push(body);
      return { id: `plan_${created.plans.length}` };
    }
    if (method === 'POST' && path === '/subscriptions') {
      created.subscriptions.push(body);
      return { id: 'sub_1', short_url: 'https://rzp.io/i/x' };
    }
    if (method === 'GET' && path.includes('/subscriptions')) return { items: [] };
    throw new Error(`unexpected Razorpay call ${method} ${path}`);
  });

  return { subscriptions, razorpay, created };
};

describe('LAUNCH50 at checkout', () => {
  afterEach(() => jest.useRealTimers());

  it('is 50% off, 100 uses, until the end of 31 Dec 2026 India time', () => {
    expect(LAUNCH50).toMatchObject({
      code: 'LAUNCH50',
      percentOff: 50,
      freeMonths: null,
      maxRedemptions: 100,
    });
    expect(LAUNCH50.expiresAt.toISOString()).toBe('2026-12-31T18:29:59.000Z');
  });

  it('validates however the buyer types it', async () => {
    const { subscriptions } = setup();
    const check = await subscriptions.validateCoupon(' launch50 ', 'org-1');
    expect(check.ok).toBe(true);
    expect(check.ok && check.coupon.percentOff).toBe(50);
  });

  it.each([
    ['INR', 'MONTHLY', 29950], // Rs 599.00 -> Rs 299.50
    ['INR', 'YEARLY', 299500], // Rs 5,990 -> Rs 2,995
    ['USD', 'MONTHLY', 750], // $15 -> $7.50
  ])(
    'Standard %s %s subscribes on a plan at half price (%i minor units)',
    async (currency, period, amount) => {
      const { razorpay, created } = setup();

      await razorpay.subscribe(
        'ud-1',
        'org-1',
        'user-1',
        { billing: 'STANDARD', period, currency, coupon: 'LAUNCH50' } as any,
        true
      );

      expect(created.plans).toHaveLength(1);
      expect(created.plans[0].item.amount).toBe(amount);
      expect(created.plans[0].item.currency).toBe(currency);
      // every renewal is charged from this plan, so the discount lasts for
      // the life of the subscription
      expect(created.subscriptions[0].plan_id).toBe('plan_1');
      expect(created.subscriptions[0].notes.coupon).toBe('LAUNCH50');
    }
  );

  it('is refused once 100 workspaces have used it', async () => {
    const { subscriptions } = setup(100);
    expect(await subscriptions.validateCoupon('LAUNCH50', 'org-1')).toEqual({
      ok: false,
      reason: 'This coupon has been fully used.',
    });
  });

  it('is refused after 31 Dec 2026', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2027-01-01T00:00:00+05:30'));
    const { subscriptions } = setup();
    expect(await subscriptions.validateCoupon('LAUNCH50', 'org-1')).toEqual({
      ok: false,
      reason: 'This coupon has expired.',
    });
  });
});
