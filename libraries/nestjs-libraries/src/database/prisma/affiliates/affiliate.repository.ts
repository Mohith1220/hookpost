import { Injectable } from '@nestjs/common';
import { PrismaRepository } from '@hookpost/nestjs-libraries/database/prisma/prisma.service';

@Injectable()
export class AffiliateRepository {
  constructor(
    private _affiliate: PrismaRepository<'affiliate'>,
    private _referral: PrismaRepository<'affiliateReferral'>,
    private _commission: PrismaRepository<'affiliateCommission'>
  ) {}

  findByUser(userId: string) {
    return this._affiliate.model.affiliate.findUnique({ where: { userId } });
  }

  findByCode(code: string) {
    return this._affiliate.model.affiliate.findUnique({ where: { code } });
  }

  create(data: {
    userId: string;
    organizationId: string;
    code: string;
    name: string;
    email: string;
    payoutDetails?: string | null;
  }) {
    return this._affiliate.model.affiliate.create({ data });
  }

  updatePayout(userId: string, payoutDetails: string | null) {
    return this._affiliate.model.affiliate.update({
      where: { userId },
      data: { payoutDetails },
    });
  }

  setActive(id: string, active: boolean) {
    return this._affiliate.model.affiliate.update({
      where: { id },
      data: { active },
    });
  }

  findReferral(organizationId: string) {
    return this._referral.model.affiliateReferral.findUnique({
      where: { organizationId },
      include: { affiliate: true },
    });
  }

  createReferral(affiliateId: string, organizationId: string) {
    return this._referral.model.affiliateReferral.create({
      data: { affiliateId, organizationId },
    });
  }

  countReferrals(affiliateId: string) {
    return this._referral.model.affiliateReferral.count({
      where: { affiliateId },
    });
  }

  findCommissionByPayment(paymentId: string) {
    return this._commission.model.affiliateCommission.findUnique({
      where: { paymentId },
    });
  }

  createCommission(data: {
    affiliateId: string;
    organizationId: string;
    paymentId: string;
    amount: number;
    commission: number;
    currency: string;
  }) {
    return this._commission.model.affiliateCommission.create({ data });
  }

  listCommissions(affiliateId: string, take = 50) {
    return this._commission.model.affiliateCommission.findMany({
      where: { affiliateId },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  allCommissions(affiliateId: string) {
    return this._commission.model.affiliateCommission.findMany({
      where: { affiliateId },
      select: {
        organizationId: true,
        commission: true,
        currency: true,
        status: true,
      },
    });
  }

  listAffiliates() {
    return this._affiliate.model.affiliate.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { referrals: true } },
        commissions: {
          select: { commission: true, currency: true, status: true },
        },
      },
    });
  }

  listPendingCommissions() {
    return this._commission.model.affiliateCommission.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      include: {
        affiliate: {
          select: { name: true, email: true, code: true, payoutDetails: true },
        },
      },
    });
  }

  markPaid(ids: string[], note: string | null) {
    return this._commission.model.affiliateCommission.updateMany({
      where: { id: { in: ids }, status: 'PENDING' },
      data: { status: 'PAID', paidAt: new Date(), paidNote: note },
    });
  }

  voidCommission(id: string, note: string | null) {
    return this._commission.model.affiliateCommission.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'VOID', paidNote: note },
    });
  }
}
