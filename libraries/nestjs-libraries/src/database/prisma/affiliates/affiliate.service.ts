import { Injectable, Logger } from '@nestjs/common';
import { Organization, User } from '@prisma/client';
import dayjs from 'dayjs';
import { AffiliateRepository } from '@hookpost/nestjs-libraries/database/prisma/affiliates/affiliate.repository';

/** How long after a workspace is created a referral can still be attached. */
const ATTRIBUTION_WINDOW_DAYS = 7;
/**
 * Every affiliate code is also a checkout coupon for their audience, so a
 * buyer who types it (or arrives on their link, which pre-fills it) gets this
 * much off and the affiliate is credited even if the cookie was lost.
 */
export const AFFILIATE_COUPON_PERCENT = 10;
/** Codes are lowercase letters, digits and dashes, as typed into a ?ref= link. */
const CODE_RE = /^[a-z0-9-]{3,40}$/;

export const normaliseAffiliateCode = (raw?: string | null) => {
  const code = (raw || '').trim().toLowerCase();
  return CODE_RE.test(code) ? code : null;
};

type Money = Record<string, number>;
const add = (m: Money, currency: string, v: number) => {
  m[currency] = (m[currency] || 0) + v;
  return m;
};

@Injectable()
export class AffiliateService {
  private readonly logger = new Logger(AffiliateService.name);

  constructor(private _affiliateRepository: AffiliateRepository) {}

  /**
   * Join the programme. Idempotent: an existing affiliate is returned as is.
   * The code is readable (first name + 3 digits) so it survives being said
   * out loud in a video or typed from a screenshot.
   */
  async join(user: User, org: Organization, payoutDetails?: string) {
    const existing = await this._affiliateRepository.findByUser(user.id);
    if (existing) return existing;

    const base =
      (user.name || user.email.split('@')[0])
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[^a-z0-9]+/g, '')
        .slice(0, 16) || 'hp';

    for (let attempt = 0; attempt < 20; attempt++) {
      const code = `${base}${Math.floor(100 + Math.random() * 900)}`;
      // The code doubles as a coupon, so it must be free in both tables.
      if (
        (await this._affiliateRepository.findByCode(code)) ||
        (await this._affiliateRepository.findCoupon(code))
      ) {
        continue;
      }
      const affiliate = await this._affiliateRepository.create({
        userId: user.id,
        organizationId: org.id,
        code,
        name: user.name || user.email.split('@')[0],
        email: user.email,
        payoutDetails: payoutDetails?.trim().slice(0, 500) || null,
      });
      await this._affiliateRepository.createCoupon(
        code,
        AFFILIATE_COUPON_PERCENT,
        affiliate.id
      );
      return affiliate;
    }
    throw new Error('Could not allocate an affiliate code');
  }

  updatePayout(userId: string, payoutDetails: string) {
    return this._affiliateRepository.updatePayout(
      userId,
      payoutDetails.trim().slice(0, 500) || null
    );
  }

  /** The signed-in affiliate's own dashboard. Null when they have not joined. */
  async getMine(userId: string) {
    const affiliate = await this._affiliateRepository.findByUser(userId);
    if (!affiliate) return null;

    const [referrals, all, recent] = await Promise.all([
      this._affiliateRepository.countReferrals(affiliate.id),
      this._affiliateRepository.allCommissions(affiliate.id),
      this._affiliateRepository.listCommissions(affiliate.id, 25),
    ]);

    const pending: Money = {};
    const paid: Money = {};
    const payingCustomers = new Set<string>();
    for (const c of all) {
      if (c.status === 'VOID') continue;
      payingCustomers.add(c.organizationId);
      add(c.status === 'PAID' ? paid : pending, c.currency, c.commission);
    }

    return {
      code: affiliate.code,
      couponPercent: AFFILIATE_COUPON_PERCENT,
      active: affiliate.active,
      commissionPercent: affiliate.commissionPercent,
      commissionMonths: affiliate.commissionMonths,
      payoutDetails: affiliate.payoutDetails,
      referrals,
      payingCustomers: payingCustomers.size,
      pending,
      paid,
      recent: recent.map((c) => ({
        id: c.id,
        createdAt: c.createdAt,
        amount: c.amount,
        commission: c.commission,
        currency: c.currency,
        status: c.status,
      })),
    };
  }

  /**
   * Attach a new workspace to the affiliate whose link brought it in. Called
   * from GET /user/self, which every signed-in page load hits, so it covers
   * every way of registering (email, Google, One Tap, OAuth) from one place.
   * Only workspaces created in the last ATTRIBUTION_WINDOW_DAYS qualify, so an
   * existing customer who later clicks someone's link is never re-attributed.
   * Never throws.
   */
  async attribute(rawCode: string | undefined, org: Organization, user: User) {
    try {
      const code = normaliseAffiliateCode(rawCode);
      if (!code || !org?.id) return;
      if (dayjs().diff(dayjs(org.createdAt), 'day') > ATTRIBUTION_WINDOW_DAYS) {
        return;
      }
      if (await this._affiliateRepository.findReferral(org.id)) return;

      const affiliate = await this._affiliateRepository.findByCode(code);
      if (!affiliate || !affiliate.active) return;
      // No self-referrals: not their own workspace, not a second workspace
      // they created themselves.
      if (affiliate.organizationId === org.id || affiliate.userId === user.id) {
        return;
      }

      await this._affiliateRepository.createReferral(affiliate.id, org.id);
      this.logger.log(`Workspace ${org.id} referred by affiliate ${code}`);
    } catch (e) {
      // A unique-index race (two tabs loading at once) lands here too.
      this.logger.warn(`Affiliate attribution skipped: ${(e as Error).message}`);
    }
  }

  /**
   * A buyer used an affiliate's code as a coupon at checkout. That is an
   * explicit choice, so unlike the cookie it has no workspace-age limit, but
   * it still never overrides an existing referral and never pays an affiliate
   * for their own workspace. `memberUserIds` are the workspace's users.
   * Called from the subscription webhook before the first charge, so the
   * commission on that charge is recorded. Never throws.
   */
  async attributeByCoupon(
    rawCode: string | undefined,
    orgId: string | undefined,
    memberUserIds: string[]
  ) {
    try {
      const code = normaliseAffiliateCode(rawCode);
      if (!code || !orgId) return;
      if (await this._affiliateRepository.findReferral(orgId)) return;

      const affiliate = await this._affiliateRepository.findByCode(code);
      if (!affiliate || !affiliate.active) return;
      if (
        affiliate.organizationId === orgId ||
        memberUserIds.includes(affiliate.userId)
      ) {
        return;
      }

      await this._affiliateRepository.createReferral(affiliate.id, orgId);
      this.logger.log(`Workspace ${orgId} referred by coupon ${code}`);
    } catch (e) {
      this.logger.warn(
        `Affiliate coupon attribution skipped: ${(e as Error).message}`
      );
    }
  }

  /**
   * Record the commission on one captured Razorpay payment. Idempotent on the
   * payment id, because Razorpay retries webhooks. Never throws: a failure here
   * must not make the charge webhook fail and re-run provisioning.
   */
  async recordCommission(orgId: string | undefined, payment: any) {
    try {
      if (!orgId || !payment?.id || !(payment.amount > 0)) return;
      if (payment.status && payment.status !== 'captured') return;

      const referral = await this._affiliateRepository.findReferral(orgId);
      if (!referral?.affiliate?.active) return;

      const { affiliate } = referral;
      const monthsIn = dayjs().diff(dayjs(referral.createdAt), 'month', true);
      if (monthsIn >= affiliate.commissionMonths) return;

      if (await this._affiliateRepository.findCommissionByPayment(payment.id)) {
        return;
      }

      await this._affiliateRepository.createCommission({
        affiliateId: affiliate.id,
        organizationId: orgId,
        paymentId: payment.id,
        amount: payment.amount,
        commission: Math.round(
          (payment.amount * affiliate.commissionPercent) / 100
        ),
        currency: payment.currency || 'INR',
      });
    } catch (e) {
      this.logger.error(
        `Affiliate commission for payment ${payment?.id} failed: ${(e as Error).message}`
      );
    }
  }

  // --- Admin -----------------------------------------------------------------

  async adminOverview() {
    const [affiliates, pending] = await Promise.all([
      this._affiliateRepository.listAffiliates(),
      this._affiliateRepository.listPendingCommissions(),
    ]);
    return {
      affiliates: affiliates.map((a) => {
        const pendingMoney: Money = {};
        const paidMoney: Money = {};
        for (const c of a.commissions) {
          if (c.status === 'PENDING') add(pendingMoney, c.currency, c.commission);
          if (c.status === 'PAID') add(paidMoney, c.currency, c.commission);
        }
        return {
          id: a.id,
          name: a.name,
          email: a.email,
          code: a.code,
          active: a.active,
          payoutDetails: a.payoutDetails,
          commissionPercent: a.commissionPercent,
          referrals: a._count.referrals,
          pending: pendingMoney,
          paid: paidMoney,
          createdAt: a.createdAt,
        };
      }),
      pendingCommissions: pending,
    };
  }

  markPaid(ids: string[], note?: string) {
    return this._affiliateRepository.markPaid(ids, note?.slice(0, 500) || null);
  }

  voidCommission(id: string, note?: string) {
    return this._affiliateRepository.voidCommission(
      id,
      note?.slice(0, 500) || null
    );
  }

  setActive(id: string, active: boolean) {
    return this._affiliateRepository.setActive(id, active);
  }
}
