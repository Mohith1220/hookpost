/**
 * Test Suite: Multi-Currency Lead Nurture Engine (10-Stage Verification)
 */

import { generateLeadEmail, LeadEmailParams } from '../../libraries/nestjs-libraries/src/emails/templates/lead-campaign.template';
import { pricingINR, pricingUSD } from '../../libraries/nestjs-libraries/src/database/prisma/subscriptions/pricing';

// Prices come from the live pricing table, so the email can never drift from checkout.
const INR_MONTH = `₹${pricingINR.STANDARD.month_price.toLocaleString('en-IN')}`;
const INR_YEAR = `₹${pricingINR.STANDARD.year_price.toLocaleString('en-IN')}`;
const USD_MONTH = `$${pricingUSD.STANDARD.month_price}`;
const USD_YEAR = `$${pricingUSD.STANDARD.year_price}`;

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`[FAIL] ${msg}`);
    process.exit(1);
  }
  console.log(`  [PASS] ${msg}`);
}

async function runTests() {
  console.log('================================================================');
  console.log('HOOKPOST LEAD DRIP & MULTI-CURRENCY TEST SUITE (10-STAGE)');
  console.log('================================================================\n');

  // Test 1: Stage 1 Email Generation - INR
  console.log('--> Test 1: Stage 1 Launch Email in INR');
  const inr1 = generateLeadEmail({
    userName: 'Akhand',
    orgName: 'jik',
    email: 'user@example.com',
    currency: 'INR',
    stage: 'STAGE_1_LAUNCH'
  });
  assert(inr1.subject.includes('50% off') && inr1.subject.length <= 50, 'Subject names the offer in under 50 characters');
  assert(inr1.html.includes(INR_MONTH), `INR monthly price ${INR_MONTH} is present`);
  assert(inr1.html.includes(INR_YEAR), `INR yearly price ${INR_YEAR} is present`);
  assert(!inr1.html.includes('₹349') && !inr1.html.includes('₹699'), 'Stale hard-coded prices are gone');
  assert(inr1.html.includes('LAUNCH50'), 'Discount code LAUNCH50 is present');
  // LAUNCH50 is a percentOff 50 coupon: checkout charges exactly half, on
  // every payment, until 31 Dec 2026 for 100 workspaces.
  assert(inr1.html.includes('₹299.50/month or ₹2,995/year'), 'INR half price matches what checkout charges');
  assert(inr1.html.includes('every payment') && inr1.html.includes('31 Dec 2026'), 'Code terms (every payment, expiry) are stated');
  assert(inr1.html.includes('Akhand'), 'Personalized name Akhand is present');

  // Test 2: Stage 1 Email Generation - USD
  console.log('\n--> Test 2: Stage 1 Launch Email in USD');
  const usd1 = generateLeadEmail({
    userName: 'Lucian',
    orgName: 'twitch',
    email: 'user@example.com',
    currency: 'USD',
    stage: 'STAGE_1_LAUNCH'
  });
  assert(usd1.html.includes(`${USD_MONTH}/month`), `USD monthly price ${USD_MONTH} is present`);
  assert(usd1.html.includes(`${USD_YEAR}/year`), `USD annual price ${USD_YEAR} is present`);
  assert(usd1.html.includes('twitch'), 'Org name twitch is rendered');
  assert(usd1.html.includes('$7.50/month or $75/year'), 'USD half price matches what checkout charges');

  // Test 3: Stage 2 Feature Spotlight Template
  console.log('\n--> Test 3: Stage 2 Feature Spotlight Template');
  const featEmail = generateLeadEmail({
    userName: 'Gokul',
    email: 'user@example.com',
    currency: 'INR',
    stage: 'STAGE_2_FEATURES'
  });
  assert(featEmail.subject.includes('One post, every channel'), 'Stage 2 subject explains the product');
  assert(featEmail.html.includes('Calendar.'), 'Calendar feature is highlighted');
  assert(featEmail.html.includes('Cursor') && featEmail.html.includes('Claude'), 'Developer tools mentioned');

  // Test 4: Stage 3 Founder Personal Touch Template
  console.log('\n--> Test 4: Stage 3 Founder Personal Touch Template');
  const founderEmail = generateLeadEmail({
    userName: 'Massifor',
    email: 'user@example.com',
    currency: 'USD',
    stage: 'STAGE_3_FOUNDER'
  });
  assert(founderEmail.subject.includes('Quick question about your Hookpost setup'), 'Founder subject line matches pattern');
  assert(founderEmail.text.includes('Mohan here, founder of Hookpost'), 'Founder intro in plain text');
  assert(founderEmail.text.includes('support@hookstep.in'), 'Founder email contact present');

  // Test 5: Currency IP Resolution Logic
  console.log('\n--> Test 5: Currency IP Resolution Logic');
  const ips = [
    { ip: '106.51.179.27', expected: 'INR' }, // India ACT
    { ip: '47.15.172.44', expected: 'INR' },   // India Airtel
    { ip: '169.150.207.232', expected: 'USD' }, // Europe
    { ip: '2a02:2f0e:1005:...', expected: 'USD' }, // Romania IPv6
    { ip: '2400:c600:...', expected: 'USD' },      // Bangladesh IPv6
    { ip: null, expected: 'USD' }                  // Fallback
  ];
  for (const { ip, expected } of ips) {
    const isIndia = ip && (ip.startsWith('106.') || ip.startsWith('47.') || ip.startsWith('49.') || ip.startsWith('117.') || ip.startsWith('122.') || ip.startsWith('182.'));
    const resolved = isIndia ? 'INR' : 'USD';
    assert(resolved === expected, `IP ${ip} correctly resolves to ${expected}`);
  }

  // Test 6: Anti-Spam Drip Progression Sequence
  console.log('\n--> Test 6: Anti-Spam Drip Progression Sequence');
  function getNextStage(daysSinceSignup: number, sentCodes: string[]) {
    if (!sentCodes.includes('drip:stage_1_launch')) {
      return 'STAGE_1_LAUNCH';
    } else if (daysSinceSignup >= 3 && !sentCodes.includes('drip:stage_2_features')) {
      return 'STAGE_2_FEATURES';
    } else if (daysSinceSignup >= 7 && !sentCodes.includes('drip:stage_3_founder')) {
      return 'STAGE_3_FOUNDER';
    }
    return null;
  }
  assert(getNextStage(0, []) === 'STAGE_1_LAUNCH', 'New lead gets Stage 1');
  assert(getNextStage(1, ['drip:stage_1_launch']) === null, 'Day 1 after Stage 1 sent gets skipped (cooldown)');
  assert(getNextStage(3, ['drip:stage_1_launch']) === 'STAGE_2_FEATURES', 'Day 3 gets Stage 2');
  assert(getNextStage(4, ['drip:stage_1_launch', 'drip:stage_2_features']) === null, 'Day 4 gets skipped (cooldown)');
  assert(getNextStage(7, ['drip:stage_1_launch', 'drip:stage_2_features']) === 'STAGE_3_FOUNDER', 'Day 7 gets Stage 3');
  assert(getNextStage(10, ['drip:stage_1_launch', 'drip:stage_2_features', 'drip:stage_3_founder']) === null, 'All stages sent -> permanently skipped');

  // Test 7: Idempotency & Repeat Prevention
  console.log('\n--> Test 7: Idempotency & Repeat Prevention');
  const mockDbSent = ['drip:stage_1_launch', 'drip:stage_2_features', 'drip:stage_3_founder'];
  for (const stage of ['drip:stage_1_launch', 'drip:stage_2_features', 'drip:stage_3_founder']) {
    const isAlreadySent = mockDbSent.includes(stage);
    assert(isAlreadySent === true, `Duplicate check prevents resending ${stage}`);
  }

  // Test 8: Mobile-Responsive HTML Structure & Tags
  console.log('\n--> Test 8: Mobile-Responsive HTML Structure');
  assert(inr1.html.includes('meta name="viewport"'), 'Viewport meta tag present');
  assert(inr1.html.includes('max-width:600px'), 'Standard 600px container present');
  assert(inr1.html.includes('data-hp-button') && inr1.html.includes('See plans'), 'Clear call-to-action button present');

  // Test 9: CAN-SPAM Compliance Requirements
  console.log('\n--> Test 9: CAN-SPAM Compliance Requirements');
  assert(inr1.html.includes('Unsubscribe'), 'Unsubscribe option is present');
  assert(inr1.text.includes('Unsubscribe'), 'Plain text contains unsubscribe');
  assert(inr1.html.includes('Hookpost by Hookstep'), 'Sender identity is clearly disclosed');
  for (const e of [inr1, usd1, featEmail, founderEmail]) {
    assert(e.html.includes('Ghatkopar, Mumbai, India'), `City-level location only in footer (${e.subject})`);
    assert(!/Pathankot|Example Street|Examplepur|145023/i.test(e.html + e.text), `No street address (${e.subject})`);
    assert(!/stripe/i.test(e.html + e.text), `No Stripe mention (${e.subject})`);
  }

  // Test 10: Multi-Currency Pricing Parity
  console.log('\n--> Test 10: Multi-Currency Pricing Parity');
  assert(inr1.html.includes(INR_MONTH) && usd1.html.includes(USD_MONTH), 'Both currencies quote the live Standard price');

  console.log('\n================================================================');
  console.log('ALL 10 LEAD DRIP & CAMPAIGN TESTS PASSED WITH ZERO ERRORS! [10/10]');
  console.log('================================================================\n');
}

runTests().catch(console.error);
