import {
  Injectable,
  Logger,
  BadRequestException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Organization } from '@prisma/client';
import { SubscriptionService } from '@hookpost/nestjs-libraries/database/prisma/subscriptions/subscription.service';
import { OrganizationService } from '@hookpost/nestjs-libraries/database/prisma/organizations/organization.service';
import { makeId } from '@hookpost/nestjs-libraries/services/make.is';
import { BillingSubscribeDto } from '@hookpost/nestjs-libraries/dtos/billing/billing.subscribe.dto';
import {
  pricing,
  getPricing,
  getCurrencyConfig,
  CURRENCY_CODE,
  CURRENCY_MINOR_MULTIPLIER,
} from '@hookpost/nestjs-libraries/database/prisma/subscriptions/pricing';
import { UsersService } from '@hookpost/nestjs-libraries/database/prisma/users/users.service';
import { TrackService } from '@hookpost/nestjs-libraries/track/track.service';
import { TrackEnum } from '@hookpost/nestjs-libraries/user/track.enum';
import { RazorpayClient } from '@hookpost/nestjs-libraries/services/razorpay.client';
import { AffiliateService } from '@hookpost/nestjs-libraries/database/prisma/affiliates/affiliate.service';
import {
  scheduledCancelAt,
  LIVE_STATES,
  buildPlanKey,
  parsePlanKey,
} from '@hookpost/nestjs-libraries/services/razorpay.mapping';
import {
  paymentFailedEmail,
  refundEmail,
  subscriptionCancelledEmail,
  subscriptionWelcomeEmail,
} from '@hookpost/nestjs-libraries/emails/templates/billing.emails';
import { RenderedEmail } from '@hookpost/nestjs-libraries/emails/layout/email.layout';
import { ioRedis } from '@hookpost/nestjs-libraries/redis/redis.service';

type Billing = 'STANDARD' | 'TEAM' | 'PRO' | 'ULTIMATE';
type Period = 'MONTHLY' | 'YEARLY';

/**
 * Number of billing cycles we request per subscription. Razorpay requires a
 * finite total_count, so we ask for the maximum sensible horizon rather than
 * letting it lapse: 10 years monthly, 10 years yearly.
 */
const TOTAL_COUNT: Record<Period, number> = { MONTHLY: 120, YEARLY: 10 };

/**
 * When Razorpay will take the first payment on a subscription: start_at for a
 * subscription created with a trial or coupon delay, else charge_at. Null when
 * neither is set.
 */
function firstChargeAt(subscription: any): Date | null {
  const at = Number(subscription?.start_at || subscription?.charge_at || 0);
  return at > 0 ? new Date(at * 1000) : null;
}

/** Free-trial length in days, matching what the billing page advertises. */
const TRIAL_DAYS_DEFAULT = 7;

/** Razorpay subscription states that will never bill again. */
const ENDED_STATES = ['cancelled', 'completed', 'expired'];

/**
 * How long a "this email went out" marker lives. Razorpay retries a webhook
 * for up to 24 hours and sends refund.created and refund.processed for the
 * same refund, so anything well past a day is enough.
 */
const EMAIL_ONCE_TTL_SECONDS = 45 * 86400;

/** How often lapsed cancellation grace periods are closed. */
const GRACE_SWEEP_MS = 60 * 60 * 1000;

function subscriptionSafeId(payment: any) {
  return payment?.order_id || payment?.invoice_id || String(payment?.created_at || '');
}

@Injectable()
export class RazorpayService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RazorpayService.name);
  private graceTimer?: NodeJS.Timeout;
  private readonly client = new RazorpayClient();
  /** planId cache, keyed by tier|period|amount so a price change forces a new plan. */
  private planCache = new Map<string, string>();
  /** Reverse map: planId -> the tier/period it represents. */
  private planTierCache = new Map<string, { billing: Billing; period: Period }>();

  constructor(
    private _subscriptionService: SubscriptionService,
    private _organizationService: OrganizationService,
    private _userService: UsersService,
    private _trackService: TrackService,
    private _affiliateService: AffiliateService
  ) {}

  /**
   * Close cancellation grace periods once they run out (see handleCancelled).
   * Only where RUN_CRON is on, which is the production backend; the sweep is
   * idempotent, so a second process running it would only repeat no-ops.
   */
  onModuleInit() {
    if (process.env.RUN_CRON !== 'true' || process.env.NODE_ENV === 'test') {
      return;
    }
    const run = () =>
      this.endLapsedCancellations().catch((e) =>
        this.logger.error(`Cancellation grace sweep failed: ${e}`)
      );
    setTimeout(run, 2 * 60 * 1000).unref();
    this.graceTimer = setInterval(run, GRACE_SWEEP_MS);
    this.graceTimer.unref();
  }

  onModuleDestroy() {
    if (this.graceTimer) clearInterval(this.graceTimer);
  }

  // ---------------------------------------------------------------------------
  // Webhooks
  // ---------------------------------------------------------------------------

  /**
   * Signature-check an inbound webhook and return the parsed event.
   * Mirrors StripeService.validateRequest so the controller shape is unchanged.
   */
  validateRequest(rawBody: Buffer, signature: string, endpointSecret: string) {
    this.client.verifyWebhook(rawBody, signature, endpointSecret);
    return JSON.parse(rawBody.toString('utf8'));
  }

  /**
   * Razorpay delivers one webhook endpoint for every event, so we branch here
   * rather than in the controller. Returns {ok:true} for events we ignore, so
   * Razorpay does not retry them.
   */
  async handleWebhook(event: any) {
    const type: string = event?.event || '';
    const subscription = event?.payload?.subscription?.entity;
    const payment = event?.payload?.payment?.entity;

    switch (type) {
      case 'subscription.authenticated':
      case 'subscription.activated':
      case 'subscription.charged': {
        const result = await this.createSubscription(subscription, payment);
        await this.recordCouponRedemption(subscription);
        // Only a charge carries money; authenticated/activated have no payment.
        // Gated on notes.service like everything else on this shared account.
        if (
          type === 'subscription.charged' &&
          subscription?.notes?.service === 'hookpost'
        ) {
          await this._affiliateService.recordCommission(
            subscription.notes.orgId,
            payment
          );
        }
        return result;
      }
      case 'subscription.updated':
        return this.updateSubscription(subscription);
      case 'subscription.cancelled':
        return this.handleCancelled(subscription);
      case 'subscription.completed':
      case 'subscription.expired':
        return this.deleteSubscription(subscription);
      case 'refund.created':
      case 'refund.processed':
        await this.handleRefund(type, event?.payload?.refund?.entity, payment);
        return { ok: true };
      case 'subscription.halted':
      case 'subscription.pending':
        // Payment is failing but the subscription is not dead yet. Leave
        // entitlements intact; Razorpay will either recover or cancel it.
        this.logger.warn(
          `Subscription ${subscription?.id} is ${type} - payment retry in progress.`
        );
        await this.handleFailedSubscriptionPayment(subscription, payment, type);
        return { ok: true };
      case 'payment.failed':
        await this.handlePaymentFailedWebhook(payment);
        return { ok: true };
      default:
        return { ok: true };
    }
  }

  /**
   * Count a website coupon as used once the customer has actually
   * authenticated the subscription it was applied to. Idempotent (upsert on
   * coupon + org), because Razorpay sends authenticated, activated and charged
   * for the same subscription. Best-effort: a failure here must not make the
   * activation webhook throw and be retried.
   */
  private async recordCouponRedemption(subscription: any) {
    const code = subscription?.notes?.coupon;
    const orgId = subscription?.notes?.orgId;
    if (!code || !orgId || !subscription?.id) return;
    try {
      await this._subscriptionService.redeemCouponByCode(
        code,
        orgId,
        subscription.id
      );
      // An affiliate's code is also a coupon: credit them for this workspace.
      const team = await this._organizationService.getTeam(orgId);
      await this._affiliateService.attributeByCoupon(
        code,
        orgId,
        (team?.users || []).map((u: any) => u.user?.id).filter(Boolean)
      );
    } catch (e) {
      this.logger.warn(
        `Coupon ${code} redemption for ${subscription.id} failed: ${(e as Error).message}`
      );
    }
  }

  /**
   * Cancel every live subscription this org holds except `keepId`.
   *
   * Only ever called from the activation webhook, once the replacement is
   * confirmed live, so a failed or abandoned checkout can never strand the
   * customer with nothing. Each cancel is best-effort and isolated: one failure
   * must not abort the others or the webhook itself, because a webhook that
   * throws gets retried and would re-run the whole activation.
   */
  private async retireSupersededSubscriptions(
    organizationId: string,
    keepId: string
  ) {
    try {
      const all = await this.getCustomerSubscriptions(organizationId);
      const stale = (all?.items || []).filter(
        (s: any) =>
          s?.id &&
          s.id !== keepId &&
          LIVE_STATES.includes(s.status) &&
          (s.notes || {}).service === 'hookpost'
      );

      for (const s of stale) {
        await this.client
          .request('POST', `/subscriptions/${s.id}/cancel`, {
            cancel_at_cycle_end: 0,
          })
          .then(() =>
            this.logger.warn(
              `Cancelled superseded subscription ${s.id} for org ${organizationId} (replaced by ${keepId}).`
            )
          )
          .catch((e: any) =>
            this.logger.error(
              `Failed cancelling superseded subscription ${s.id}: ${e}`
            )
          );
      }
    } catch (e) {
      this.logger.error(
        `retireSupersededSubscriptions failed for ${organizationId}: ${e}`
      );
    }
  }

  /** A subscription became live (first activation, or a renewal charge). */
  async createSubscription(subscription: any, payment?: any) {
    if (!subscription?.id) return { ok: true };

    const notes = subscription.notes || {};
    const orgId: string | undefined = notes.orgId;

    // Our own checkout stamps notes.service, so this doubles as proof the
    // subscription is ours. It gates the notes fallback below: on a Razorpay
    // account shared with another product, a foreign plan could carry a
    // notes.billing that happens to spell one of our tier names, and trusting
    // it would hand that customer a Hookpost plan they never bought.
    const isOurs = notes.service === 'hookpost';

    // The plan is authoritative; notes can be stale after a plan change.
    const fromPlan = await this.resolveTierFromPlan(subscription.plan_id);
    const billing = (fromPlan?.billing ||
      (isOurs ? (notes.billing || '').toUpperCase() : '')) as Billing;
    const period = (fromPlan?.period ||
      (notes.period || 'MONTHLY').toUpperCase()) as Period;

    if (!pricing[billing]) {
      this.logger.warn(
        `Ignoring subscription ${subscription.id}: could not resolve tier ` +
          `(plan_id=${subscription.plan_id}, notes.billing=${notes.billing}).`
      );
      return { ok: true };
    }

    const customerId = subscription.customer_id;

    // createSubscription runs for authenticated, activated, every monthly
    // charged, updated, and the checkout-callback sync. The welcome email must
    // go out once per subscription, not on each of those, so remember whether
    // this subscription was already on file before the upsert below.
    const alreadyKnown =
      !!(await this._subscriptionService.getSubscriptionByIdentifier(subscription.id));

    await this._subscriptionService.createOrUpdateSubscription(
      subscription.status === 'authenticated', // treated as trialing
      subscription.id,
      customerId,
      pricing[billing].channel!,
      billing,
      period,
      scheduledCancelAt(subscription),
      undefined,
      orgId
    );

    if (orgId && isOurs) {
      // Retire any OTHER live subscription this org still holds.
      //
      // changeSubscription switches plans in place with a PATCH, but Razorpay
      // rejects that outright on a UPI mandate - "subscriptions cannot be
      // updated when payment mode is upi" - and every payment this account has
      // ever taken was UPI. The PATCH failure is caught and we fall through to
      // issuing a fresh mandate, which is the right recovery, except nothing
      // ever cancelled the old one: the customer ended up authorising the new
      // plan while the previous plan kept charging. An upgrade from Standard to
      // Pro billed Rs 599 AND Rs 1,999 every month, forever.
      //
      // Guarded on isOurs and on id inequality: this Razorpay account is shared
      // with other products, and cancelling a foreign subscription here would
      // be far worse than the bug it fixes.
      await this.retireSupersededSubscriptions(orgId, subscription.id);

      // Report the revenue conversion. TrackService was injected here but never
      // called, so Purchase - the only event that says an ad actually produced
      // money - never fired at all. Without it, ad platforms optimise towards
      // signups and cannot tell a paying customer from a tyre-kicker.
      //
      // Fired server-side from the webhook on purpose: it survives ad blockers
      // and closed tabs, and it is the only place the real charged amount is
      // known. Only on an actual charge - `authenticated` and `activated` carry
      // no money.
      await this.trackPurchase(orgId, payment);

      // Keep Organization.paymentId aligned with the Razorpay customer.
      await this._subscriptionService.updateCustomerId(orgId, customerId);
      if (!alreadyKnown) {
        this.sendSubscriptionWelcomeEmail(
          orgId,
          billing,
          period,
          firstChargeAt(subscription)
        ).catch((e) => {
          this.logger.error(`Failed to send subscription welcome email: ${e}`);
        });
      }
    }

    return { ok: true };
  }

  /**
   * Report a completed payment to the ads pixel, server-side.
   *
   * Never throws: a tracking outage must not fail a webhook Razorpay will
   * otherwise retry, which would double-provision the subscription.
   */
  private async trackPurchase(orgId: string, payment?: any) {
    try {
      if (!payment?.amount) return;

      const team = await this._organizationService.getTeam(orgId);
      const user = team?.users?.[0]?.user;

      await this._trackService.track(
        // Deterministic per payment, so a Razorpay webhook retry reports the
        // same event id and Meta collapses it rather than counting twice.
        `purchase_${payment.id || subscriptionSafeId(payment)}`,
        // No client IP or user-agent here on purpose. This runs in a Razorpay
        // webhook, so the only address available is Razorpay's server - sending
        // that would attach the wrong signal to the conversion. The hashed
        // email below is the match key that matters for a purchase.
        '',
        '',
        TrackEnum.Purchase,
        {
          // Razorpay amounts are in the minor unit (paise), the pixel wants
          // the major unit.
          value: payment.amount / 100,
          currency: payment.currency || 'INR',
        },
        undefined,
        user as any
      );
    } catch (e) {
      this.logger.error(`Purchase tracking failed for org ${orgId}: ${e}`);
    }
  }

  /**
   * `firstCharge` is when Razorpay will take the first payment. More than half
   * a day away means the customer is in a free trial (7 days by default, plus
   * any free-months coupon), and the email states the real length and date
   * rather than assuming 7. `status === 'authenticated'` is not a trial
   * signal: a paid-upfront subscription is also `authenticated` for a moment.
   */
  async sendSubscriptionWelcomeEmail(
    orgId: string,
    billing: Billing,
    period: Period,
    firstCharge: Date | null
  ) {
    try {
      const apiKey = process.env.RESEND_API_KEY || '';
      if (!apiKey) return;

      const team = await this._organizationService.getTeam(orgId);
      const user = team?.users?.[0]?.user;
      const email = user?.email;
      const org = await this._organizationService.getOrgById(orgId);
      const orgName = org?.name || 'Your Team';

      if (!email || !email.includes('@')) return;

      const { Resend } = await import('resend');
      const resend = new Resend(apiKey);

      const channels = pricing[billing]?.channel || 10;
      const msUntilCharge = firstCharge ? firstCharge.getTime() - Date.now() : 0;
      const isTrial = msUntilCharge > 12 * 3600 * 1000;
      const { subject, html, text } = subscriptionWelcomeEmail({
        orgName,
        billing,
        channels,
        period,
        isTrial,
        trialDays: isTrial ? Math.round(msUntilCharge / 86_400_000) : undefined,
        firstChargeAt: isTrial ? firstCharge! : undefined,
      });

      await resend.emails.send({
        from: 'Hookpost Support <support@hookstep.in>',
        to: email,
        reply_to: 'support@hookstep.in',
        subject,
        html,
        text,
      });

      this.logger.log(
        `Subscription welcome email sent to ${email} for org ${orgId}`
      );
    } catch (err) {
      this.logger.error(`Error sending subscription welcome email: ${err}`);
    }
  }

  async sendPaymentFailedEmail(
    orgId: string,
    details: {
      billing?: Billing;
      period?: Period;
      amount?: number;
      currency?: string;
      reason?: string;
      isHalted?: boolean;
    }
  ) {
    try {
      const apiKey = process.env.RESEND_API_KEY || '';
      if (!apiKey) return;

      const team = await this._organizationService.getTeam(orgId);
      const user = team?.users?.[0]?.user;
      const email = user?.email;
      const org = await this._organizationService.getOrgById(orgId);
      const orgName = org?.name || 'Your Team';

      if (!email || !email.includes('@')) return;

      const { Resend } = await import('resend');
      const resend = new Resend(apiKey);

      const { subject, html, text } = paymentFailedEmail({
        orgName,
        billing: details.billing,
        amount: details.amount,
        currency: details.currency,
        reason: details.reason,
        isHalted: details.isHalted,
      });

      await resend.emails.send({
        from: 'Hookpost Billing <support@hookstep.in>',
        to: email,
        reply_to: 'support@hookstep.in',
        subject,
        html,
        text,
      });

      this.logger.log(
        `Payment failed notification email sent to ${email} for org ${orgId}`
      );
    } catch (err) {
      this.logger.error(`Error sending payment failed email: ${err}`);
    }
  }

  private async handleFailedSubscriptionPayment(subscription: any, payment?: any, type?: string) {
    try {
      if (!subscription?.id) return;
      const notes = subscription.notes || {};
      let orgId: string | undefined = notes.orgId;

      if (!orgId) {
        const subRecord = await this._subscriptionService.getSubscriptionByIdentifier(subscription.id);
        orgId = subRecord?.organizationId;
      }
      if (!orgId && subscription.customer_id) {
        const org = await this._organizationService.getOrgByCustomerId(subscription.customer_id);
        orgId = org?.id;
      }

      if (!orgId) {
        this.logger.warn(`Cannot resolve orgId for failing subscription ${subscription.id}`);
        return;
      }

      const fromPlan = await this.resolveTierFromPlan(subscription.plan_id);
      const billing = fromPlan?.billing || (notes.billing ? notes.billing.toUpperCase() : undefined);
      const period = fromPlan?.period || (notes.period ? notes.period.toUpperCase() : undefined);

      const amount = payment?.amount
        ? payment.amount / 100
        : (subscription.plan?.item?.amount ? subscription.plan.item.amount / 100 : undefined);
      const currency = payment?.currency || subscription.plan?.item?.currency || 'INR';
      const reason = payment?.error_description || (type === 'subscription.halted'
        ? 'Bank retries exhausted — subscription renewal halted'
        : 'Bank authorization declined or UPI mandate pending');

      await this.sendPaymentFailedEmail(orgId, {
        billing,
        period,
        amount,
        currency,
        reason,
        isHalted: type === 'subscription.halted'
      });
    } catch (err) {
      this.logger.error(`Error handling failed subscription payment for ${subscription?.id}: ${err}`);
    }
  }

  private async handlePaymentFailedWebhook(payment: any) {
    try {
      if (!payment?.id) return;
      const notes = payment.notes || {};
      let orgId: string | undefined = notes.orgId;

      if (!orgId && payment.invoice_id) {
        try {
          const invoice = await this.client.request('GET', `/invoices/${payment.invoice_id}`);
          if (invoice?.subscription_id) {
            const subRecord = await this._subscriptionService.getSubscriptionByIdentifier(invoice.subscription_id);
            orgId = subRecord?.organizationId;
          }
        } catch {}
      }

      if (!orgId && payment.customer_id) {
        const org = await this._organizationService.getOrgByCustomerId(payment.customer_id);
        orgId = org?.id;
      }

      if (!orgId) return;

      const amount = payment.amount ? payment.amount / 100 : undefined;
      const currency = payment.currency || 'INR';
      const reason = payment.error_description || 'Payment was declined by your bank or UPI app';

      await this.sendPaymentFailedEmail(orgId, {
        amount,
        currency,
        reason,
        isHalted: false
      });
    } catch (err) {
      this.logger.error(`Error handling payment.failed webhook for ${payment?.id}: ${err}`);
    }
  }

  /**
   * Directly fetch subscription details from Razorpay and provision entitlements.
   * Useful when verifying subscription payment immediately from checkout callback.
   */
  async syncSubscriptionById(subscriptionId: string) {
    if (!subscriptionId) return { ok: false };
    try {
      const subscription = await this.client.request(
        'GET',
        `/subscriptions/${subscriptionId}`
      );
      if (subscription?.id) {
        await this.createSubscription(subscription);
        return { ok: true, subscription };
      }
    } catch (e) {
      this.logger.error(`syncSubscriptionById failed for ${subscriptionId}: ${e}`);
    }
    return { ok: false };
  }

  async updateSubscription(subscription: any) {
    // Razorpay sends the full entity on update, so activation and update
    // converge on the same reconciliation path.
    return this.createSubscription(subscription);
  }

  /**
   * Cancel/complete/expire. This must positively identify the subscription as
   * ours before touching anything.
   *
   * Razorpay customers are account-level, and one Razorpay account can serve
   * several products, each with its own webhook subscribed to the same events.
   * So a cancellation raised by a *different* product is delivered here too,
   * carrying a customer_id that may well match a paying Hookpost organization.
   * Keying the downgrade off customer_id alone would strip that organization's
   * plan because of an event that had nothing to do with Hookpost.
   *
   * The subscription id is the thing that is unambiguously ours or not: we
   * store it as Subscription.identifier when the plan is created. No stored
   * row, no action - and the downgrade is then scoped to the organization that
   * actually owns that row rather than to every org sharing the customer.
   */
  async deleteSubscription(subscription: any) {
    if (!subscription?.id) return { ok: true };

    const known = await this._subscriptionService.getSubscriptionByIdentifier(
      subscription.id
    );

    if (!known) {
      this.logger.warn(
        `Ignoring ${subscription.id}: no Hookpost subscription with that ` +
          `identifier (customer ${subscription.customer_id}). Likely another ` +
          `product on the same Razorpay account.`
      );
      return { ok: true };
    }

    await this._subscriptionService.deleteSubscriptionByOrg(
      known.organizationId
    );
    return { ok: true };
  }

  // ---------------------------------------------------------------------------
  // Cancellation and refund emails
  // ---------------------------------------------------------------------------

  /**
   * subscription.cancelled, from the customer or from the Razorpay dashboard.
   *
   * Razorpay only sends this once the subscription has actually stopped: at
   * the end of the cycle for a scheduled cancellation, straight away for an
   * immediate one. An immediate cancel mid-cycle leaves current_end in the
   * future, and the customer has paid for that time - the cancellation policy
   * promises they keep it. So the plan stays until current_end (the hourly
   * endLapsedCancellations sweep closes it), unless that period's payment was
   * refunded, in which case it ends now.
   *
   * Positively identified like deleteSubscription: no stored Subscription row
   * with this identifier, no action and no email.
   */
  async handleCancelled(subscription: any) {
    if (!subscription?.id) return { ok: true };

    const known = await this._subscriptionService.getSubscriptionByIdentifier(
      subscription.id
    );
    if (!known) {
      this.logger.warn(
        `Ignoring cancellation of ${subscription.id}: no Hookpost subscription ` +
          `with that identifier (customer ${subscription.customer_id}).`
      );
      return { ok: true };
    }

    const orgId = known.organizationId;
    const paidEnd = subscription.current_end
      ? new Date(subscription.current_end * 1000)
      : null;
    const periodLeft = !!paidEnd && paidEnd.getTime() > Date.now() + 60_000;
    const refunded = periodLeft
      ? await this.currentPeriodRefunded(subscription.id)
      : false;
    const keepUntil = periodLeft && !refunded ? paidEnd : null;

    if (keepUntil) {
      await this._subscriptionService.scheduleCancellation(
        orgId,
        subscription.id,
        keepUntil
      );
    } else {
      await this._subscriptionService.deleteSubscriptionByOrg(orgId);
    }

    // Changing plan on a UPI mandate issues a new subscription and cancels the
    // old one (see subscribe / retireSupersededSubscriptions). That customer
    // is switching, not leaving, so "your plan is cancelled" would be wrong.
    if (await this.hasReplacementSubscription(orgId, subscription)) {
      this.logger.log(
        `Cancellation of ${subscription.id} is a plan switch for org ${orgId}; no email.`
      );
      return { ok: true };
    }

    await this.sendOnce(`cancelled:${subscription.id}`, async () => {
      const org = await this._organizationService.getOrgById(orgId);
      return this.sendCustomerEmail(
        orgId,
        subscriptionCancelledEmail({
          orgName: org?.name || 'your workspace',
          billing: known.subscriptionTier,
          period: known.period,
          accessUntil: keepUntil,
          endedAt: subscription.ended_at
            ? new Date(subscription.ended_at * 1000)
            : new Date(),
        }),
        'Hookpost Billing <support@hookstep.in>'
      );
    });
    return { ok: true };
  }

  /**
   * refund.processed, and refund.created when Razorpay already reports the
   * refund as processed (a refund.processed for the same refund follows or
   * has already arrived; the email goes out once per refund id either way).
   * Never throws: a failure here must not make Razorpay redeliver.
   *
   * Only refunds of a Hookpost subscription charge qualify, found through the
   * payment's invoice to a subscription tagged notes.service = 'hookpost'. The
   * Rs 5 mandate-authorisation payment Razorpay refunds by itself at every
   * checkout has no invoice and no notes, so it never produces an email.
   */
  async handleRefund(type: string, refund: any, payment?: any) {
    try {
      if (!refund?.id || !refund.payment_id) return;
      if (type === 'refund.created' && refund.status !== 'processed') return;

      const pay =
        payment?.id === refund.payment_id
          ? payment
          : await this.client
              .request('GET', `/payments/${refund.payment_id}`)
              .catch(() => null);
      const payService = pay?.notes?.service;
      if (payService && payService !== 'hookpost') return;

      let sub: any = null;
      if (pay?.invoice_id) {
        const invoice = await this.client
          .request('GET', `/invoices/${pay.invoice_id}`)
          .catch(() => null);
        if (invoice?.subscription_id) {
          sub = await this.client
            .request('GET', `/subscriptions/${invoice.subscription_id}`)
            .catch(() => null);
        }
      }

      let orgId: string | undefined;
      if (sub) {
        if (sub.notes?.service !== 'hookpost' || !sub.notes?.orgId) return;
        orgId = sub.notes.orgId;
      } else if (payService === 'hookpost' && pay?.notes?.orgId) {
        orgId = pay.notes.orgId;
      }
      if (!orgId) return;

      const local = await this._subscriptionService.getSubscription(orgId);
      // No row, or a row without a paid tier, means no active plan.
      const localTier: string | null = local?.subscriptionTier
        ? String(local.subscriptionTier)
        : null;
      let billing: string | null =
        (sub && (await this.resolveTierFromPlan(sub.plan_id))?.billing) ||
        localTier;

      let plan: 'active' | 'cancelled' | 'none' = 'none';
      let nextChargeAt: Date | null = null;
      if (sub && ENDED_STATES.includes(sub.status)) {
        if (local?.identifier === sub.id) {
          // The refunded subscription was only still on because of the
          // cancellation grace period. A refund ends that.
          await this._subscriptionService.deleteSubscriptionByOrg(orgId);
          plan = 'cancelled';
        } else {
          plan = localTier ? 'active' : 'cancelled';
          if (localTier) billing = localTier;
        }
      } else if (sub) {
        plan = 'active';
        const next = Number(sub.charge_at || sub.current_end || 0);
        nextChargeAt = next > 0 ? new Date(next * 1000) : null;
      } else if (localTier) {
        plan = 'active';
      }

      await this.sendOnce(`refund:${refund.id}`, async () => {
        const org = await this._organizationService.getOrgById(orgId!);
        return this.sendCustomerEmail(
          orgId!,
          refundEmail({
            orgName: org?.name || 'your workspace',
            amount: Number(refund.amount || 0) / 100,
            currency: refund.currency || pay?.currency || 'INR',
            refundId: refund.id,
            paymentId: refund.payment_id,
            refundedAt: new Date(
              (Number(refund.created_at) || Math.floor(Date.now() / 1000)) * 1000
            ),
            billing,
            plan,
            nextChargeAt,
          }),
          'Hookpost Billing <support@hookstep.in>'
        );
      });
    } catch (e) {
      this.logger.error(`Refund handling failed for ${refund?.id}: ${e}`);
    }
  }

  /**
   * Close grace periods left by handleCancelled once their paid time is up.
   * Only rows whose Razorpay subscription is really `cancelled` and ours, so a
   * row carrying an old or odd cancelAt is never downgraded on a guess.
   */
  async endLapsedCancellations(now = new Date()) {
    const rows = await this._subscriptionService.getLapsedCancellations(now);
    let ended = 0;
    for (const row of rows) {
      const remote = await this.client
        .request('GET', `/subscriptions/${row.identifier}`)
        .catch(() => null);
      if (
        remote?.status !== 'cancelled' ||
        remote?.notes?.service !== 'hookpost'
      ) {
        continue;
      }
      const end = Number(remote.current_end || 0) * 1000;
      if (end > now.getTime() + 60_000) continue;
      await this._subscriptionService.deleteSubscriptionByOrg(row.organizationId);
      ended++;
      this.logger.log(
        `Cancellation grace ended for org ${row.organizationId} (${row.identifier}).`
      );
    }
    return { checked: rows.length, ended };
  }

  /** Was the payment for the subscription's current, unfinished period refunded? */
  private async currentPeriodRefunded(subscriptionId: string) {
    try {
      const res = await this.client.request(
        'GET',
        `/invoices?subscription_id=${encodeURIComponent(subscriptionId)}&count=10`
      );
      const nowSec = Date.now() / 1000;
      for (const inv of res?.items || []) {
        if (!inv?.payment_id || Number(inv.billing_end || 0) <= nowSec) continue;
        const pay = await this.client
          .request('GET', `/payments/${inv.payment_id}`)
          .catch(() => null);
        if (Number(pay?.amount_refunded || 0) > 0) return true;
      }
    } catch (e) {
      this.logger.warn(`Could not check refunds on ${subscriptionId}: ${e}`);
    }
    return false;
  }

  /** Does this org hold a newer Hookpost subscription that is still live? */
  private async hasReplacementSubscription(orgId: string, cancelled: any) {
    try {
      const all = await this.getCustomerSubscriptions(orgId);
      return (all?.items || []).some(
        (s: any) =>
          s?.id &&
          s.id !== cancelled.id &&
          LIVE_STATES.includes(s.status) &&
          s.notes?.service === 'hookpost' &&
          s.notes?.orgId === orgId &&
          Number(s.created_at || 0) >= Number(cancelled.created_at || 0)
      );
    } catch {
      return false;
    }
  }

  /**
   * Run `send` at most once per key. The key is claimed in Redis first
   * (SET NX), because Razorpay retries webhooks and sends two refund events
   * per refund. A failed send releases the claim so a redelivery can retry.
   * If Redis cannot be reached nothing is sent: a missing email is easier to
   * put right than a customer told twice about one refund.
   */
  private async sendOnce(key: string, send: () => Promise<boolean>) {
    const redisKey = `razorpay:customer-email:${key}`;
    let claimed = false;
    try {
      claimed =
        (await (ioRedis as any).set(
          redisKey,
          new Date().toISOString(),
          'EX',
          EMAIL_ONCE_TTL_SECONDS,
          'NX'
        )) === 'OK';
    } catch (e) {
      this.logger.error(`Could not claim ${redisKey}; email not sent: ${e}`);
      return false;
    }
    if (!claimed) {
      this.logger.log(`Skipping ${key}: that email already went out.`);
      return false;
    }
    const ok = await send().catch(() => false);
    if (!ok) await (ioRedis as any).del(redisKey).catch(() => undefined);
    return ok;
  }

  /** Send a rendered email to the workspace's billing contact (its first member). */
  private async sendCustomerEmail(
    orgId: string,
    email: RenderedEmail,
    from: string
  ): Promise<boolean> {
    try {
      const apiKey = process.env.RESEND_API_KEY || '';
      if (!apiKey) return false;
      const team = await this._organizationService.getTeam(orgId);
      const to = team?.users?.[0]?.user?.email;
      if (!to || !to.includes('@')) return false;

      const { Resend } = await import('resend');
      const result: any = await new Resend(apiKey).emails.send({
        from,
        to,
        reply_to: 'support@hookstep.in',
        subject: email.subject,
        html: email.html,
        text: email.text,
      });
      if (result?.error) {
        throw new Error(result.error.message || JSON.stringify(result.error));
      }
      this.logger.log(`"${email.subject}" sent to ${to} for org ${orgId}`);
      return true;
    } catch (e) {
      this.logger.error(`Billing email to org ${orgId} failed: ${e}`);
      return false;
    }
  }

  /**
   * Kept for parity with the Stripe controller's invoice.payment_succeeded
   * branch; Razorpay covers this with subscription.charged.
   */
  async paymentSucceeded(event: any) {
    const subscription = event?.payload?.subscription?.entity;
    if (!subscription) return { ok: true };
    return this.createSubscription(subscription);
  }

  // ---------------------------------------------------------------------------
  // Customers, plans
  // ---------------------------------------------------------------------------

  async createOrGetCustomer(organization: Organization): Promise<string> {
    if (organization.paymentId) {
      return organization.paymentId;
    }
    // Mirror upstream: the billing contact is the first member of the team.
    const team = await this._organizationService.getTeam(organization.id);
    const rawEmail = team?.users?.[0]?.user?.email || '';
    // Razorpay rejects malformed emails, and self-hosted installs allow
    // username-only logins, so synthesise a domain when one is missing.
    const email =
      rawEmail.indexOf('@') > -1
        ? rawEmail
        : `${rawEmail || organization.id}@${
            process.env.BILLING_EMAIL_DOMAIN || 'hookpost.local'
          }`;

    try {
      const created = await this.client.request('POST', '/customers', {
        name: organization.name || 'Hookpost customer',
        email,
        // Do not error if a customer with this email already exists -- return it.
        fail_existing: 0,
        notes: { orgId: organization.id },
      });

      await this._subscriptionService.updateCustomerId(
        organization.id,
        created.id
      );
      return created.id;
    } catch (err: any) {
      if (
        err?.message?.includes('Customer already exists') ||
        err?.message?.includes('already exists')
      ) {
        const list = await this.client.request<{
          items: Array<{ id: string; email: string }>;
        }>('GET', `/customers?count=100`);
        const existing = list?.items?.find(
          (c) => c.email && c.email.toLowerCase() === email.toLowerCase()
        );
        if (existing?.id) {
          await this._subscriptionService.updateCustomerId(
            organization.id,
            existing.id
          );
          return existing.id;
        }
      }
      throw err;
    }
  }

  async getCustomerByOrganizationId(organizationId: string) {
    const org = await this._organizationService.getOrgById(organizationId);
    return org?.paymentId || '';
  }

  private amountFor(billing: Billing, period: Period, currency: string = CURRENCY_CODE) {
    const curr = (currency || CURRENCY_CODE).toUpperCase();
    const planPricing = getPricing(curr);
    const p = planPricing[billing] || pricing[billing];
    const major = period === 'MONTHLY' ? p.month_price : p.year_price;
    const mult = getCurrencyConfig(curr).minorMultiplier || CURRENCY_MINOR_MULTIPLIER;
    return major * mult;
  }

  /**
   * Razorpay plans are immutable once created, so we key on the exact amount.
   * Changing a price in pricing.ts therefore provisions a new plan rather than
   * silently repricing existing subscribers.
   */
  private async findOrCreatePlan(
    billing: Billing,
    period: Period,
    currency: string = CURRENCY_CODE,
    // Set by a percentOff coupon. The plan key includes the amount, so a
    // discounted price gets its own plan and never touches the list-price one.
    amountOverride?: number
  ) {
    const curr = (currency || CURRENCY_CODE).toUpperCase();
    const amount = amountOverride ?? this.amountFor(billing, period, curr);
    const key = buildPlanKey(billing, period, amount, curr);
    const cached = this.planCache.get(key);
    if (cached) return cached;

    // Page through every plan. Razorpay caps `count` at 100, and this account
    // may be shared with another product, so our plan can easily sit past the
    // first page. Stopping at page one would silently miss it and create a
    // duplicate plan on every single subscribe.
    const match = await this.findPlanByKey(key);
    if (match) {
      this.planCache.set(key, match);
      return match;
    }

    const created = await this.client.request('POST', '/plans', {
      period: period === 'MONTHLY' ? 'monthly' : 'yearly',
      interval: 1,
      item: {
        name: `Hookpost ${billing} ${period} (${curr})${
          amountOverride != null ? ' - coupon price' : ''
        }`,
        amount,
        currency: curr,
      },
      notes: { hookpost_key: key, billing, period },
    });
    this.planCache.set(key, created.id);
    return created.id;
  }

  /**
   * Resolve which tier/period a Razorpay plan represents.
   *
   * This is the authoritative source when reconciling a webhook, and it must be
   * preferred over the subscription's own `notes`. On an upgrade we PATCH the
   * subscription's plan_id, but Razorpay keeps the notes that were set when the
   * subscription was created -- so trusting notes.billing would write the OLD
   * tier back to the database and under-entitle a customer who just paid more.
   *
   * Plans are created by findOrCreatePlan with notes.hookpost_key of the form
   * "TIER|PERIOD|amount|currency", which we parse back out here.
   */
  private async resolveTierFromPlan(
    planId?: string
  ): Promise<{ billing: Billing; period: Period } | null> {
    if (!planId) return null;

    const cached = this.planTierCache.get(planId);
    if (cached) return cached;

    const plan = await this.client
      .request('GET', `/plans/${planId}`)
      .catch(() => null);
    if (!plan) return null;

    // hookpost_key is written by createPlan for every plan we own, so its
    // absence means the plan belongs to another product on this account.
    // Falling back to plan.notes.billing here would let a foreign plan named
    // after one of our tiers resolve as ours.
    const parsed = parsePlanKey(plan?.notes?.hookpost_key);
    if (!parsed) return null;

    const billing = (parsed.billing || '').toUpperCase();
    const resolvedPeriod = (
      parsed.period ||
      plan?.notes?.period ||
      (plan?.period === 'yearly' ? 'YEARLY' : 'MONTHLY')
    ).toUpperCase();

    if (!pricing[billing]) return null;

    const result = {
      billing: billing as Billing,
      period: resolvedPeriod as Period,
    };
    this.planTierCache.set(planId, result);
    return result;
  }

  /**
   * Find a plan by its hookpost_key, paging through the full list.
   *
   * Razorpay's /plans endpoint caps `count` at 100 and paginates with `skip`.
   * The cap is why this loops: on an account shared with another product our
   * plan may not be on the first page.
   */
  private async findPlanByKey(key: string): Promise<string | null> {
    const PAGE = 100;
    // Safety valve so a pathological account cannot spin forever.
    const MAX_PAGES = 50;

    for (let page = 0; page < MAX_PAGES; page++) {
      const skip = page * PAGE;
      const res = await this.client
        .request('GET', `/plans?count=${PAGE}&skip=${skip}`)
        .catch(() => null);
      const items: any[] = res?.items || [];

      const hit = items.find((plan: any) => plan?.notes?.hookpost_key === key);
      if (hit) return hit.id;

      // A short page means we have seen everything.
      if (items.length < PAGE) return null;
    }

    this.logger.warn(
      `Gave up scanning plans after ${MAX_PAGES * PAGE}; a duplicate plan may be created.`
    );
    return null;
  }

  // ---------------------------------------------------------------------------
  // Subscribe / change plan
  // ---------------------------------------------------------------------------

  /**
   * Create a new subscription, or move an existing one to a different plan.
   *
   * Returns either { url } for a fresh subscription (the caller redirects the
   * customer to Razorpay's hosted checkout to authorise the mandate) or { id }
   * when an existing mandate was rebound to a new plan without re-auth.
   */
  async subscribe(
    uniqueId: string,
    organizationId: string,
    userId: string,
    body: BillingSubscribeDto,
    allowTrial: boolean
  ) {
    const id = makeId(10);
    const billing = body.billing.toUpperCase() as Billing;
    const period = (body.period || 'MONTHLY').toUpperCase() as Period;
    const currency = (body.currency || CURRENCY_CODE).toUpperCase();

    const org = (await this._organizationService.getOrgById(organizationId))!;
    const customerId = await this.createOrGetCustomer(org);

    // Website coupon, applied only when a subscription is created: Razorpay
    // cannot re-price a live UPI Autopay mandate. percentOff buys a discounted
    // plan for the life of the subscription; freeMonths delays its start.
    let coupon: { id: string; code: string; percentOff: number | null; freeMonths: number | null } | undefined;
    let amountOverride: number | undefined;
    if (body.coupon && body.coupon.trim()) {
      const check = await this._subscriptionService.validateCoupon(
        body.coupon,
        organizationId
      );
      if (!check.ok) {
        throw new BadRequestException(check.reason);
      }
      coupon = check.coupon;
      if (coupon.percentOff) {
        const base = this.amountFor(billing, period, currency);
        amountOverride = Math.round((base * (100 - coupon.percentOff)) / 100);
      }
    }

    const planId = await this.findOrCreatePlan(
      billing,
      period,
      currency,
      amountOverride
    );

    const current = await this._subscriptionService.getSubscription(
      organizationId
    );

    if (coupon && current?.identifier) {
      throw new BadRequestException(
        'Coupons apply to new subscriptions only. This workspace already has one.'
      );
    }

    // Existing mandate -> switch plans in place, no new authorisation needed.
    if (current?.identifier) {
      try {
        await this.client.request(
          'PATCH',
          `/subscriptions/${current.identifier}`,
          {
            plan_id: planId,
            quantity: 1,
            // Upgrades take effect immediately; Razorpay raises a prorated
            // charge for the remainder of the current cycle.
            schedule_change_at: 'now',
            customer_notify: 1,
            // Best effort: keep notes consistent with the new plan. Webhook
            // reconciliation does not depend on this succeeding -- it reads the
            // plan -- but stale notes are confusing in the dashboard.
            notes: {
              service: 'hookpost',
              billing,
              period,
              currency,
              orgId: organizationId,
              userId,
              id,
            },
          }
        );
        return { id };
      } catch (err) {
        this.logger.error(
          `In-place plan change failed for ${current.identifier}: ${err}`
        );
        // Fall through and issue a fresh mandate instead of failing the request.
      }
    }

    // The billing UI advertises "Pay NOTHING for the first 7 days", and
    // org.allowTrial decides eligibility. Requiring RAZORPAY_TRIAL_DAYS to be
    // set as well meant an unset variable silently charged trial-eligible
    // customers immediately, contradicting the page they just agreed to. Default
    // to the advertised 7 days; set RAZORPAY_TRIAL_DAYS=0 to turn trials off
    // (and change the copy if you do).
    const configuredTrial = process.env.RAZORPAY_TRIAL_DAYS;
    const trialDays =
      configuredTrial === undefined || configuredTrial === ''
        ? TRIAL_DAYS_DEFAULT
        : Number(configuredTrial);

    const trialStart =
      allowTrial && Number.isFinite(trialDays) && trialDays > 0
        ? Math.floor(Date.now() / 1000) + trialDays * 86400
        : undefined;
    // freeMonths coupon: push the first charge out by that many 30-day months,
    // on top of any trial.
    const couponDelay = (coupon?.freeMonths || 0) * 30 * 86400;
    const startAt = couponDelay
      ? (trialStart || Math.floor(Date.now() / 1000)) + couponDelay
      : trialStart;

    const created = await this.client.request('POST', '/subscriptions', {
      plan_id: planId,
      total_count: TOTAL_COUNT[period],
      quantity: 1,
      customer_notify: 1,
      customer_id: customerId,
      ...(startAt ? { start_at: startAt } : {}),
      ...(process.env.RAZORPAY_OFFER_ID
        ? { offer_id: process.env.RAZORPAY_OFFER_ID }
        : {}),
      notes: {
        service: 'hookpost',
        billing,
        period,
        currency,
        orgId: organizationId,
        userId,
        id,
        ud: uniqueId,
        ...(coupon ? { coupon: coupon.code } : {}),
      },
    });

    // The coupon is NOT redeemed here. Creating a subscription only opens
    // checkout; the plan screen rebuilds it on every tier or period toggle, and
    // most are abandoned. Redeeming at creation burned single-use codes on
    // checkouts nobody paid for, and made the second toggle fail with "already
    // used on your workspace". It is redeemed from notes.coupon when the
    // authentication webhook arrives - see recordCouponRedemption.

    // Retire any older live subscription this org still holds, now rather than
    // only on activation.
    //
    // This same call already runs from createSubscription(), which fires on the
    // activation webhook. That covers the case where a customer authenticates a
    // replacement - but it can never fire for a subscription that is never
    // authenticated, and those are exactly the ones that pile up. One customer
    // produced a MONTHLY and a YEARLY mandate in the same minute on 12 Sep 2026
    // by toggling the period on the billing page; both sat in `created` until
    // they expired, and the cleanup never ran because neither ever activated.
    //
    // LIVE_STATES already includes 'created', so the existing filter catches
    // them. It just needed calling from here as well. Awaited rather than fired
    // and forgotten: the function swallows and logs its own errors, and a
    // duplicate live mandate is worse than a few hundred ms before the modal.
    await this.retireSupersededSubscriptions(organizationId, created.id);

    return { id, url: created.short_url, subscriptionId: created.id };
  }

  /**
   * Razorpay has no hosted billing portal. Point the customer at our own
   * billing screen instead, so the caller's { url } contract still holds.
   */
  async createBillingPortalLink(_customer: string) {
    const base =
      process.env.FRONTEND_URL || process.env.MAIN_URL || 'http://localhost:4200';
    return { url: `${base}/billing` };
  }

  // ---------------------------------------------------------------------------
  // Cancellation
  // ---------------------------------------------------------------------------

  async getCustomerSubscriptions(organizationId: string) {
    const customerId = await this.getCustomerByOrganizationId(organizationId);
    if (!customerId) return { items: [], count: 0 };
    try {
      return await this.client.request(
        'GET',
        `/subscriptions?customer_id=${encodeURIComponent(customerId)}&count=100`
      );
    } catch (e: any) {
      // Razorpay API returns 400 "customer_id is/are not required and should not be sent"
      return { items: [], count: 0 };
    }
  }

  private async liveSubscriptionFor(organizationId: string) {
    const local = await this._subscriptionService.getSubscription(
      organizationId
    );
    if (local?.identifier) {
      const remote = await this.client
        .request('GET', `/subscriptions/${local.identifier}`)
        .catch(() => null);
      if (remote && LIVE_STATES.includes(remote.status)) return remote;
    }
    const all = await this.getCustomerSubscriptions(organizationId);
    return (all?.items || []).find((s: any) => LIVE_STATES.includes(s.status));
  }

  /** Toggle "cancel at end of period" on and off. */
  async setToCancel(organizationId: string) {
    const id = makeId(10);
    const sub = await this.liveSubscriptionFor(organizationId);
    if (!sub) return { id, cancel_at: undefined };

    // Already scheduled to end -> the user is un-cancelling. Razorpay cannot
    // revoke a scheduled cancellation, so we re-subscribe on the same plan.
    if (sub.end_at && sub.status !== 'cancelled') {
      const resumed = await this.client
        .request('POST', '/subscriptions', {
          plan_id: sub.plan_id,
          total_count: sub.total_count || 120,
          quantity: 1,
          customer_notify: 1,
          customer_id: sub.customer_id,
          start_at: sub.end_at,
          notes: sub.notes,
        })
        .catch((e: any) => {
          this.logger.error(`Failed to resume subscription: ${e}`);
          return null;
        });
      if (resumed) return { id, cancel_at: undefined };
    }

    const cancelled = await this.client.request(
      'POST',
      `/subscriptions/${sub.id}/cancel`,
      { cancel_at_cycle_end: 1 }
    );

    return {
      id,
      cancel_at: cancelled.end_at
        ? new Date(cancelled.end_at * 1000)
        : undefined,
    };
  }

  /** Hard cancel, effective immediately. */
  async cancelSubscription(organizationId: string) {
    const sub = await this.liveSubscriptionFor(organizationId);
    if (!sub) return { ok: true };
    await this.client.request('POST', `/subscriptions/${sub.id}/cancel`, {
      cancel_at_cycle_end: 0,
    });
    await this._subscriptionService.deleteSubscription(sub.customer_id);
    return { ok: true };
  }

  async cancelAllSubscriptions(organizationId: string) {
    try {
      const local = await this._subscriptionService.getSubscription(
        organizationId
      );
      if (local?.identifier) {
        const remote = await this.client
          .request('GET', `/subscriptions/${local.identifier}`)
          .catch(() => null);
        if (remote && LIVE_STATES.includes(remote.status)) {
          await this.client
            .request('POST', `/subscriptions/${local.identifier}/cancel`, {
              cancel_at_cycle_end: 0,
            })
            .catch((e: any) =>
              this.logger.error(`Failed cancelling ${local.identifier}: ${e}`)
            );
        }
      }

      const all = await this.getCustomerSubscriptions(organizationId).catch(
        () => ({ items: [], count: 0 })
      );
      for (const sub of all?.items || []) {
        if (!LIVE_STATES.includes(sub.status)) continue;
        await this.client
          .request('POST', `/subscriptions/${sub.id}/cancel`, {
            cancel_at_cycle_end: 0,
          })
          .catch((e: any) =>
            this.logger.error(`Failed cancelling ${sub.id}: ${e}`)
          );
      }
      const customerId = await this.getCustomerByOrganizationId(organizationId);
      if (customerId) {
        await this._subscriptionService.deleteSubscription(customerId);
      }
    } catch (e: any) {
      this.logger.error(`Failed cancelAllSubscriptions for ${organizationId}: ${e}`);
    }
    return { ok: true };
  }

  async checkSubscription(organizationId: string, subscriptionId: string) {
    return this._subscriptionService.checkSubscription(
      organizationId,
      subscriptionId
    );
  }

  // ---------------------------------------------------------------------------
  // Invoices, charges, refunds
  // ---------------------------------------------------------------------------

  async getCharges(organizationId: string) {
    const customerId = await this.getCustomerByOrganizationId(organizationId);
    if (!customerId) return [];
    const invoices = await this.client.request(
      'GET',
      `/invoices?customer_id=${encodeURIComponent(customerId)}&count=100`
    );
    return (invoices?.items || []).map((inv: any) => ({
      id: inv.payment_id || inv.id,
      amount: (inv.amount || 0) / CURRENCY_MINOR_MULTIPLIER,
      currency: inv.currency,
      status: inv.status,
      created: inv.issued_at ? new Date(inv.issued_at * 1000) : null,
      invoiceUrl: inv.short_url,
      receipt: inv.receipt,
    }));
  }

  async refundCharges(organizationId: string, chargeIds: string[]) {
    const results: any[] = [];
    for (const paymentId of chargeIds) {
      const refund = await this.client
        .request('POST', `/payments/${paymentId}/refund`, {
          notes: { orgId: organizationId, reason: 'hookpost_admin_refund' },
        })
        .catch((e: any) => {
          this.logger.error(`Refund failed for ${paymentId}: ${e}`);
          return { id: null, error: String(e) };
        });
      results.push(refund);
    }
    return results;
  }

  // ---------------------------------------------------------------------------
  // Proration preview
  // ---------------------------------------------------------------------------

  /**
   * Preview what changing plan costs today.
   *
   * Razorpay has no "preview upcoming invoice" endpoint, so we compute the
   * proration ourselves the same way Razorpay does on an immediate plan change:
   * unused value on the current plan is credited against the new plan's price.
   */
  async prorate(organizationId: string, body: BillingSubscribeDto) {
    const billing = body.billing.toUpperCase() as Billing;
    const period = (body.period || 'MONTHLY').toUpperCase() as Period;
    const currency = (body.currency || CURRENCY_CODE).toUpperCase();
    const mult = getCurrencyConfig(currency).minorMultiplier || CURRENCY_MINOR_MULTIPLIER;
    const target = this.amountFor(billing, period, currency) / mult;

    const sub = await this.liveSubscriptionFor(organizationId);
    if (!sub) return { price: target };

    const now = Math.floor(Date.now() / 1000);
    const start = sub.current_start || now;
    const end = sub.current_end || now;
    const cycle = Math.max(end - start, 1);
    const remaining = Math.max(end - now, 0);

    const local = await this._subscriptionService.getSubscription(
      organizationId
    );
    const currentTier = (local?.subscriptionTier || 'FREE') as Billing;
    const currentPeriod = (local?.period || 'MONTHLY') as Period;
    const planPricing = getPricing(currency);
    const currentAmount =
      (planPricing[currentTier]
        ? this.amountFor(currentTier, currentPeriod, currency)
        : 0) / mult;

    const credit = currentAmount * (remaining / cycle);
    const price = Math.max(target - credit, 0);

    return { price: Math.round(price * 100) / 100 };
  }

  // ---------------------------------------------------------------------------
  // Packages
  // ---------------------------------------------------------------------------

  /**
   * Advertised prices come straight from pricing.ts rather than the payment
   * provider, so the marketing page renders correctly even before any Razorpay
   * plan has been provisioned.
   */
  async getPackages(currency?: string) {
    const curr = (currency || CURRENCY_CODE).toUpperCase();
    const activePricing = getPricing(curr);
    const tiers = Object.values(activePricing).filter((p) => p.month_price > 0);
    return {
      month: tiers.map((p) => ({
        name: p.current,
        recurring: 'month',
        price: p.month_price,
        currency: curr,
      })),
      year: tiers.map((p) => ({
        name: p.current,
        recurring: 'year',
        price: p.year_price,
        currency: curr,
      })),
    };
  }

  // ---------------------------------------------------------------------------
  // Discounts / coupons
  // ---------------------------------------------------------------------------
  //
  // Razorpay Offers cannot be created over the API -- they are defined in the
  // dashboard and referenced by id. So the retention-discount flow is driven by
  // RAZORPAY_OFFER_ID instead of creating a coupon on the fly.

  async checkDiscount(_customer: string) {
    // "Has a discount already been applied?" We have no per-customer coupon
    // state in Razorpay, so report false and let the offer decide at checkout.
    return false;
  }

  async applyDiscount(_customer: string) {
    if (!process.env.RAZORPAY_OFFER_ID) {
      this.logger.warn(
        'applyDiscount called but RAZORPAY_OFFER_ID is unset; no offer applied.'
      );
      return { ok: false, reason: 'no_offer_configured' };
    }
    // The offer is attached on the next subscription create (see subscribe()).
    return { ok: true, offerId: process.env.RAZORPAY_OFFER_ID };
  }

  async getCouponInfo(_organizationId: string) {
    return { coupon: null as string | null, percentOff: 0 };
  }

  async applyCoupon(_organizationId: string, _body: any) {
    return { ok: false, reason: 'coupons_not_supported_on_razorpay' };
  }

  async cancelCoupon(_organizationId: string) {
    return { ok: true };
  }

  // ---------------------------------------------------------------------------
  // Trial
  // ---------------------------------------------------------------------------

  /**
   * End a trial early by charging the mandate now. Razorpay does not expose a
   * "finish trial" call, so we bring the next charge forward to immediately.
   */
  async finishTrial(paymentId: string) {
    if (!paymentId) return { ok: false };
    const subs = await this.client
      .request(
        'GET',
        `/subscriptions?customer_id=${encodeURIComponent(paymentId)}&count=10`
      )
      .catch(() => null);
    const sub = (subs?.items || []).find((s: any) =>
      LIVE_STATES.includes(s.status)
    );
    if (!sub) return { ok: false };

    await this.client
      .request('PATCH', `/subscriptions/${sub.id}`, {
        start_at: Math.floor(Date.now() / 1000),
        schedule_change_at: 'now',
      })
      .catch((e: any) => this.logger.error(`finishTrial failed: ${e}`));
    return { ok: true };
  }

  // ---------------------------------------------------------------------------
  // Parity stubs
  // ---------------------------------------------------------------------------

  /**
   * Stripe's embedded Checkout has no Razorpay analogue: Razorpay Checkout is a
   * client-side JS modal keyed on a subscription id. We therefore create the
   * subscription and hand the frontend everything the modal needs.
   */
  async embedded(
    uniqueId: string,
    organizationId: string,
    userId: string,
    body: BillingSubscribeDto,
    allowTrial: boolean
  ) {
    const result = await this.subscribe(
      uniqueId,
      organizationId,
      userId,
      body,
      allowTrial
    );
    const currency = (body.currency || CURRENCY_CODE).toUpperCase();
    return {
      ...result,
      keyId: process.env.RAZORPAY_KEY_ID || '',
      currency,
      providerName: 'razorpay',
    };
  }

  /**
   * Upstream syncs Stripe customer emails when two accounts are merged.
   * Razorpay customers are immutable on email, so this is a no-op we keep for
   * call-site compatibility.
   */
  async syncCustomerEmailsAfterSwitch(_users: any[]) {
    return { ok: true };
  }

  // Chatbase was a Postiz-specific partner integration with its own Stripe
  // Connect refund maths. It has no meaning in Hookpost; these return inert
  // values so the routes stay wired but never move money.
  async chatbaseRefundPreview(_organizationId: string) {
    return {
      amount: 0,
      currency: CURRENCY_CODE,
      refunded: false,
      supported: false,
    };
  }

  async chatbaseRefund(_organizationId: string) {
    return {
      ok: false,
      supported: false,
      // The caller branches on `refunded` to decide whether to email the
      // customer. Always false here: this path never moves money in Hookpost.
      refunded: false,
      amount: 0,
      currency: CURRENCY_CODE,
    };
  }

  async lifetimeDeal(organizationId: string, code: string) {
    // Lifetime codes are validated locally; no payment provider involved.
    const exists = await this._subscriptionService.getCode(code);
    if (!exists) return { ok: false, reason: 'invalid_code' };
    return { ok: true };
  }

  async checkValidCard(_event: any) {
    // Stripe pre-authorises a small amount to validate a card. Razorpay's
    // mandate authorisation already does this at checkout time.
    return { ok: true };
  }
}
