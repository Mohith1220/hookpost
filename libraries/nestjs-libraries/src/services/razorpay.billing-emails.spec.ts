import 'reflect-metadata';
import { RazorpayService } from '@hookpost/nestjs-libraries/services/razorpay.service';
import {
  refundEmail,
  subscriptionCancelledEmail,
} from '@hookpost/nestjs-libraries/emails/templates/billing.emails';

// Customer emails for subscription.cancelled and refund.* webhooks. Razorpay,
// Resend, Redis and the database are all fakes: nothing leaves the machine.

jest.mock(
  '@hookpost/nestjs-libraries/database/prisma/subscriptions/subscription.service',
  () => ({ SubscriptionService: class {} })
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

// Redis with real SET NX semantics, so the dedupe is actually exercised.
const redisData = new Map<string, string>();
jest.mock('@hookpost/nestjs-libraries/redis/redis.service', () => ({
  ioRedis: {
    set: jest.fn(async (key: string, value: string, ...args: any[]) => {
      if (args.includes('NX') && redisData.has(key)) return null;
      redisData.set(key, value);
      return 'OK';
    }),
    del: jest.fn(async (key: string) => (redisData.delete(key) ? 1 : 0)),
  },
}));

const sent: any[] = [];
const mockSend = jest.fn(async (msg: any) => {
  sent.push(msg);
  return { data: { id: `email_${sent.length}` }, error: null };
});
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({ emails: { send: mockSend } })),
}));

// Fake Razorpay: objects by path.
const rzp = new Map<string, any>();
const mockRequest = jest.fn(async (method: string, path: string) => {
  if (method !== 'GET') throw new Error(`unexpected ${method} ${path}`);
  const [base, query] = path.split('?');
  if (base === '/invoices' && query) {
    const sub = new URLSearchParams(query).get('subscription_id');
    return {
      items: [...rzp.values()].filter(
        (o) => o.entity === 'invoice' && o.subscription_id === sub
      ),
    };
  }
  if (base === '/subscriptions' && query) {
    return { items: [...rzp.values()].filter((o) => o.entity === 'subscription') };
  }
  const hit = rzp.get(base);
  if (!hit) throw new Error(`404 ${path}`);
  return hit;
});
jest.mock('@hookpost/nestjs-libraries/services/razorpay.client', () => ({
  RazorpayClient: jest.fn().mockImplementation(() => ({ request: mockRequest })),
}));

const DAY = 86400;
const now = () => Math.floor(Date.now() / 1000);
const ORG = 'org-chai';

function put(path: string, obj: any) {
  rzp.set(path, obj);
  return obj;
}

function setup(local: any) {
  let row = local ? { ...local } : null;
  const subscriptions = {
    getSubscriptionByIdentifier: jest.fn(async (id: string) =>
      row && row.identifier === id ? row : null
    ),
    getSubscription: jest.fn(async () => row),
    scheduleCancellation: jest.fn(async (_org: string, _id: string, at: Date) => {
      row = { ...row, cancelAt: at };
    }),
    deleteSubscriptionByOrg: jest.fn(async () => {
      row = null;
    }),
    getLapsedCancellations: jest.fn(async (at: Date) =>
      row && row.cancelAt && row.cancelAt < at ? [row] : []
    ),
  };
  const organizations = {
    getOrgById: jest.fn(async (id: string) => ({ id, name: 'Chai Point Social', paymentId: 'cust_1' })),
    getTeam: jest.fn(async () => ({ users: [{ user: { email: 'priya@chaipoint.in' } }] })),
  };
  const razorpay = new RazorpayService(
    subscriptions as any,
    organizations as any,
    {} as any,
    {} as any,
    {} as any
  );
  return { razorpay, subscriptions, row: () => row };
}

const standardRow = (identifier: string) => ({
  organizationId: ORG,
  identifier,
  subscriptionTier: 'STANDARD',
  period: 'MONTHLY',
  cancelAt: null,
});

function hookpostSub(id: string, extra: any = {}) {
  return put(`/subscriptions/${id}`, {
    id,
    entity: 'subscription',
    status: 'active',
    plan_id: 'plan_std',
    customer_id: 'cust_1',
    created_at: now() - 40 * DAY,
    current_start: now() - 5 * DAY,
    current_end: now() + 25 * DAY,
    charge_at: now() + 25 * DAY,
    notes: { service: 'hookpost', orgId: ORG },
    ...extra,
  });
}

function charge(subId: string, payId: string, extra: any = {}) {
  put(`/invoices/inv_${payId}`, {
    id: `inv_${payId}`,
    entity: 'invoice',
    subscription_id: subId,
    payment_id: payId,
    billing_start: now() - 5 * DAY,
    billing_end: now() + 25 * DAY,
  });
  return put(`/payments/${payId}`, {
    id: payId,
    entity: 'payment',
    amount: 59900,
    currency: 'INR',
    invoice_id: `inv_${payId}`,
    customer_id: 'cust_1',
    amount_refunded: 0,
    notes: { service: 'hookpost', orgId: ORG },
    ...extra,
  });
}

const refund = (id: string, paymentId: string, amount = 59900, status = 'processed') => ({
  id,
  entity: 'refund',
  amount,
  currency: 'INR',
  payment_id: paymentId,
  notes: { comment: '' },
  status,
  created_at: now(),
});

beforeEach(() => {
  rzp.clear();
  redisData.clear();
  sent.length = 0;
  mockSend.mockClear();
  process.env.RESEND_API_KEY = 're_test';
  put('/plans/plan_std', { id: 'plan_std', notes: { hookpost_key: 'STANDARD|MONTHLY|59900|INR' } });
});

describe('subscription.cancelled email', () => {
  it('mid-cycle cancel from the dashboard keeps the plan until current_end, emails once', async () => {
    const sub = hookpostSub('sub_live', { status: 'cancelled', ended_at: now() });
    charge('sub_live', 'pay_1');
    const { razorpay, subscriptions, row } = setup(standardRow('sub_live'));

    const event = { event: 'subscription.cancelled', payload: { subscription: { entity: sub } } };
    await razorpay.handleWebhook(event);
    await razorpay.handleWebhook(event); // Razorpay retry

    expect(subscriptions.deleteSubscriptionByOrg).not.toHaveBeenCalled();
    expect(row()!.cancelAt!.getTime()).toBe(sub.current_end * 1000);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('priya@chaipoint.in');
    expect(sent[0].subject).toBe('Your Hookpost plan is cancelled');
    const until = new Date(sub.current_end * 1000).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata',
    });
    expect(sent[0].text).toContain(`Paid access until: ${until}`);
    expect(sent[0].text).toContain('Future charges: None');
    expect(sent[0].text).toContain("you won't be charged again");
    expect(sent[0].text).toContain('Resubscribe: https://hookpost.hookstep.in/billing');
    expect(sent[0].text).toContain('Hookpost by Hookstep · Ghatkopar, Mumbai, India');
    expect(sent[0].html).not.toMatch(/Hookstep/i);
  });

  it('the grace sweep downgrades only after current_end, and only a cancelled Razorpay sub', async () => {
    const sub = hookpostSub('sub_live', { status: 'cancelled', ended_at: now() });
    charge('sub_live', 'pay_1');
    const { razorpay, subscriptions } = setup(standardRow('sub_live'));
    await razorpay.handleWebhook({ event: 'subscription.cancelled', payload: { subscription: { entity: sub } } });

    expect(await razorpay.endLapsedCancellations(new Date())).toEqual({ checked: 0, ended: 0 });
    // A day after the paid period, while Razorpay still reports the paid end.
    const later = new Date((sub.current_end + DAY) * 1000);
    sub.status = 'active'; // never downgrade a sub Razorpay says is live
    expect(await razorpay.endLapsedCancellations(later)).toEqual({ checked: 1, ended: 0 });
    sub.status = 'cancelled';
    sub.current_end = now() - 60;
    expect(await razorpay.endLapsedCancellations(later)).toEqual({ checked: 1, ended: 1 });
    expect(subscriptions.deleteSubscriptionByOrg).toHaveBeenCalledWith(ORG);
  });

  it('cycle-end cancel: the period is over, so the plan ends now and the email says so', async () => {
    const sub = hookpostSub('sub_end', { status: 'cancelled', current_end: now() - 10, ended_at: now() - 10 });
    const { razorpay, subscriptions } = setup(standardRow('sub_end'));
    await razorpay.handleWebhook({ event: 'subscription.cancelled', payload: { subscription: { entity: sub } } });
    expect(subscriptions.deleteSubscriptionByOrg).toHaveBeenCalledWith(ORG);
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toContain('Plan ended:');
    expect(sent[0].text).toContain('The workspace is now on the Free plan');
  });

  it('a cancel after the period was refunded ends the plan now', async () => {
    const sub = hookpostSub('sub_ref', { status: 'cancelled', ended_at: now() });
    charge('sub_ref', 'pay_r', { amount_refunded: 59900 });
    const { razorpay, subscriptions } = setup(standardRow('sub_ref'));
    await razorpay.handleWebhook({ event: 'subscription.cancelled', payload: { subscription: { entity: sub } } });
    expect(subscriptions.scheduleCancellation).not.toHaveBeenCalled();
    expect(subscriptions.deleteSubscriptionByOrg).toHaveBeenCalledWith(ORG);
    expect(sent[0].text).toContain('Plan ended:');
  });

  it('a plan switch (newer live Hookpost sub) keeps the plan but sends no email', async () => {
    const old = hookpostSub('sub_old', { status: 'cancelled', ended_at: now() });
    hookpostSub('sub_new', { status: 'created', created_at: now() });
    const { razorpay } = setup(standardRow('sub_old'));
    await razorpay.handleWebhook({ event: 'subscription.cancelled', payload: { subscription: { entity: old } } });
    expect(sent).toHaveLength(0);
  });

  it('a subscription Hookpost does not hold is ignored', async () => {
    const other = hookpostSub('sub_unknown', { status: 'cancelled', notes: { service: 'tablamigo' } });
    const { razorpay, subscriptions } = setup(standardRow('sub_mine'));
    await razorpay.handleWebhook({ event: 'subscription.cancelled', payload: { subscription: { entity: other } } });
    expect(subscriptions.deleteSubscriptionByOrg).not.toHaveBeenCalled();
    expect(sent).toHaveLength(0);
  });
});

describe('refund emails', () => {
  it('refund.created (processed) then refund.processed send one email; plan stays active', async () => {
    hookpostSub('sub_live');
    const pay = charge('sub_live', 'pay_1');
    const { razorpay, subscriptions } = setup(standardRow('sub_live'));
    const r = refund('rfnd_1', 'pay_1', 59900);

    await razorpay.handleWebhook({ event: 'refund.created', payload: { refund: { entity: r }, payment: { entity: pay } } });
    await razorpay.handleWebhook({ event: 'refund.processed', payload: { refund: { entity: r }, payment: { entity: pay } } });
    await razorpay.handleWebhook({ event: 'refund.processed', payload: { refund: { entity: r }, payment: { entity: pay } } });

    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toBe('Your refund of ₹599 is on its way');
    expect(sent[0].text).toContain('Refund ID: rfnd_1');
    expect(sent[0].text).toContain('usually reaches your bank in 5–7 working days');
    expect(sent[0].text).toContain('Your plan: Standard · still active');
    expect(sent[0].text).toContain('stays active and renews on');
    expect(subscriptions.deleteSubscriptionByOrg).not.toHaveBeenCalled();
  });

  it('a pending refund.created waits for refund.processed', async () => {
    hookpostSub('sub_live');
    const pay = charge('sub_live', 'pay_1');
    const { razorpay } = setup(standardRow('sub_live'));
    const r = refund('rfnd_p', 'pay_1', 59900, 'pending');
    await razorpay.handleWebhook({ event: 'refund.created', payload: { refund: { entity: r }, payment: { entity: pay } } });
    expect(sent).toHaveLength(0);
    await razorpay.handleWebhook({ event: 'refund.processed', payload: { refund: { entity: { ...r, status: 'processed' } }, payment: { entity: pay } } });
    expect(sent).toHaveLength(1);
  });

  it('a partial refund of a cancelled sub in its grace period ends the plan and says cancelled', async () => {
    const sub = hookpostSub('sub_c', { status: 'cancelled', ended_at: now() });
    const pay = charge('sub_c', 'pay_c');
    const { razorpay, subscriptions } = setup({ ...standardRow('sub_c'), cancelAt: new Date(sub.current_end * 1000) });
    await razorpay.handleWebhook({ event: 'refund.processed', payload: { refund: { entity: refund('rfnd_c', 'pay_c', 49300) }, payment: { entity: pay } } });
    expect(subscriptions.deleteSubscriptionByOrg).toHaveBeenCalledWith(ORG);
    expect(sent[0].subject).toBe('Your refund of ₹493 is on its way');
    expect(sent[0].text).toContain('Your plan: Standard · cancelled');
    expect(sent[0].text).toContain('Resubscribe: https://hookpost.hookstep.in/billing');
  });

  it('fetches the payment when the event has none', async () => {
    hookpostSub('sub_live');
    charge('sub_live', 'pay_1');
    const { razorpay } = setup(standardRow('sub_live'));
    await razorpay.handleWebhook({ event: 'refund.processed', payload: { refund: { entity: refund('rfnd_2', 'pay_1') } } });
    expect(sent).toHaveLength(1);
  });

  it('ignores the Rs 5 mandate-authorisation refund (no invoice, no notes)', async () => {
    const pay = put('/payments/pay_auth', { id: 'pay_auth', amount: 500, currency: 'INR', invoice_id: null, notes: [], customer_id: 'cust_1' });
    const { razorpay } = setup(standardRow('sub_live'));
    await razorpay.handleWebhook({ event: 'refund.processed', payload: { refund: { entity: refund('rfnd_auth', 'pay_auth', 500) }, payment: { entity: pay } } });
    expect(sent).toHaveLength(0);
  });

  it("ignores another product's refund", async () => {
    put('/subscriptions/sub_tm', { id: 'sub_tm', status: 'cancelled', notes: { service: 'tablamigo', user_id: 'u1' } });
    const pay = charge('sub_tm', 'pay_tm', { notes: { service: 'tablamigo', user_id: 'u1' } });
    const { razorpay } = setup(standardRow('sub_live'));
    await razorpay.handleWebhook({ event: 'refund.processed', payload: { refund: { entity: refund('rfnd_tm', 'pay_tm') }, payment: { entity: pay } } });
    expect(sent).toHaveLength(0);
  });

  it('a failed send releases the claim so a redelivery can retry', async () => {
    hookpostSub('sub_live');
    const pay = charge('sub_live', 'pay_1');
    const { razorpay } = setup(standardRow('sub_live'));
    mockSend.mockImplementationOnce(async () => ({ data: null, error: { message: 'rate limited' } }) as any);
    const ev = { event: 'refund.processed', payload: { refund: { entity: refund('rfnd_3', 'pay_1') }, payment: { entity: pay } } };
    await razorpay.handleWebhook(ev);
    expect(sent).toHaveLength(0);
    await razorpay.handleWebhook(ev);
    expect(sent).toHaveLength(1);
  });
});

describe('templates', () => {
  it('never name the legal entity or a street address', () => {
    const emails = [
      subscriptionCancelledEmail({ orgName: 'A', billing: 'PRO', period: 'YEARLY', accessUntil: new Date() }),
      subscriptionCancelledEmail({ orgName: 'A', billing: 'PRO', accessUntil: null }),
      refundEmail({ orgName: 'A', amount: 5990, currency: 'INR', refundId: 'rfnd_x', refundedAt: new Date(), plan: 'none' }),
    ];
    for (const e of emails) {
      expect(e.html).toContain('Hookpost by Hookstep · Ghatkopar, Mumbai, India');
      expect(e.html + e.text).not.toMatch(/Hookstep|\bRoad\b|\bMarg\b|\bStreet\b/i);
    }
    expect(emails[2].subject).toBe('Your refund of ₹5,990 is on its way');
    expect(emails[2].text).not.toContain('Your plan:');
  });

  it('escapes the workspace name', () => {
    const e = subscriptionCancelledEmail({ orgName: '<b>x</b>', billing: 'STANDARD', accessUntil: null });
    expect(e.html).not.toContain('<b>x</b>');
  });
});
