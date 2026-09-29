/**
 * Creates the LAUNCH50 website coupon that the lead-drip emails promise
 * (libraries/nestjs-libraries/src/emails/templates/lead-campaign.template.ts).
 * Idempotent: if a coupon with this code already exists it prints it and
 * changes nothing.
 *
 * What it does at checkout (razorpay.service.ts subscribe()): percentOff buys
 * a discounted Razorpay plan, so the 50% applies to every charge of that
 * subscription, monthly or yearly, on any paid tier. Coupons only apply when a
 * subscription is created; a workspace can use it once.
 *
 * Same shape as the admin endpoint POST /billing/admin/coupons creates.
 *
 * Run on the server (no TypeScript toolchain there):
 *   node_modules/.bin/esbuild scripts/create-launch50.ts --bundle \
 *     --platform=node --format=cjs --external:@prisma/client \
 *     --outfile=/tmp/create-launch50.js
 *   scp /tmp/create-launch50.js server:/tmp/
 *   ssh server 'cd ~/hookpost && NODE_PATH=node_modules \
 *     DOTENV_CONFIG_PATH=.env node -r dotenv/config /tmp/create-launch50.js'
 */
import { PrismaClient } from '@prisma/client';

export const LAUNCH50 = {
  code: 'LAUNCH50',
  percentOff: 50,
  freeMonths: null,
  maxRedemptions: 100,
  // End of 31 Dec 2026, India time
  expiresAt: new Date('2026-12-31T23:59:59+05:30'),
  note: 'Lead drip launch offer: 50% off for the life of the subscription',
};

const show = (coupon: unknown) => console.log(JSON.stringify(coupon, null, 2));

async function main() {
  const prisma = new PrismaClient();
  try {
    const before = await prisma.coupon.findUnique({
      where: { code: LAUNCH50.code },
      include: { _count: { select: { redemptions: true } } },
    });
    if (before) {
      console.log(`${LAUNCH50.code} already exists, nothing changed:`);
      show(before);
      return;
    }

    console.log(`Before: no ${LAUNCH50.code} coupon.`);
    const after = await prisma.coupon.create({
      data: LAUNCH50,
      include: { _count: { select: { redemptions: true } } },
    });
    console.log('After:');
    show(after);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
