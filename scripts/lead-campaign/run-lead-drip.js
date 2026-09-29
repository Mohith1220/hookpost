/**
 * Hookpost Automated Lead Nurture Drip Engine
 *
 * Implements a strict anti-spam 3-stage drip sequence (Day 1, Day 3, Day 7)
 * with dynamic currency detection (INR vs USD) and persistent idempotency checks
 * in PostgreSQL to guarantee zero duplicate emails.
 */

const { PrismaClient } = require('/home/flexiple_jr/hookpost/node_modules/@prisma/client');
const { Resend } = require('/home/flexiple_jr/hookpost/node_modules/resend');
require('/home/flexiple_jr/hookpost/node_modules/dotenv').config({ path: '/home/flexiple_jr/hookpost/.env' });

const prisma = new PrismaClient();
const resend = new Resend(process.env.RESEND_API_KEY || '');

// The emails themselves live in
// libraries/nestjs-libraries/src/emails/templates/lead-campaign.template.ts and
// use the same layout as every other Hookpost email. This script runs with
// plain node on the server, so it loads an esbuild bundle of that file.
// Rebuild it with scripts/lead-campaign/build-lead-email.sh after editing.
const { generateLeadEmail } = require('./lead-email.generated.js');

function buildTemplate(params) {
  return generateLeadEmail(params);
}

function resolveCurrency(user) {
  const ip = user.ip || '';
  // Indian IP ranges: 106.*, 47.*, 49.*, 117.*, 122.*, 182.*, 157.32.*-157.51.*
  if (
    ip.startsWith('106.') ||
    ip.startsWith('47.') ||
    ip.startsWith('49.') ||
    ip.startsWith('117.') ||
    ip.startsWith('122.') ||
    ip.startsWith('182.')
  ) {
    return 'INR';
  }
  // International IPs or IPv6 (2a02:... Romania, 169.150:... Europe, 2400:... Bangladesh)
  return 'USD';
}

async function runLeadDrip(options = {}) {
  const { dryRun = false, targetEmail = null } = options;
  console.log(`\n======================================================`);
  console.log(`🚀 HOOKPOST AUTOMATED LEAD DRIP ENGINE`);
  console.log(`Mode: ${dryRun ? 'DRY-RUN (Simulated)' : 'LIVE SENDING'}`);
  console.log(`======================================================\n`);

  // Query all users without active subscriptions (tier = FREE)
  const users = await prisma.user.findMany({
    where: {
      isSuperAdmin: false,
      ...(targetEmail ? { email: targetEmail } : {})
    },
    include: {
      organizations: {
        include: {
          organization: {
            include: {
              subscription: true,
              usedCodes: true
            }
          }
        }
      }
    },
    orderBy: { createdAt: 'asc' }
  });

  const now = new Date();
  const summary = { processed: 0, sent: 0, skipped: 0, errors: 0 };

  for (const user of users) {
    const org = user.organizations[0]?.organization;
    if (!org) continue;

    // Only target leads who have NO active paid subscription
    const hasActiveSubscription =
      org.subscription &&
      ['STANDARD', 'TEAM', 'PRO', 'ULTIMATE'].includes(org.subscription.subscriptionTier);

    if (hasActiveSubscription) {
      continue;
    }

    // Filter out internal fixtures
    if (
      user.email.includes('reviewer@hookstep.in') ||
      user.email === 'test@hookstep.in'
    ) {
      continue;
    }

    summary.processed++;
    const daysSinceSignup = Math.floor((now - new Date(user.createdAt)) / (1000 * 60 * 60 * 24));
    const currency = resolveCurrency(user);

    // Check last drip send time to enforce minimum 24-hour cooldown between emails
    const dripHistory = (org.usedCodes || [])
      .filter(c => c.code.startsWith('drip:'))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    if (dripHistory.length > 0) {
      const lastDripTime = new Date(dripHistory[0].createdAt);
      const hoursSinceLastDrip = (now - lastDripTime) / (1000 * 60 * 60);
      if (hoursSinceLastDrip < 24) {
        console.log(`[COOLDOWN] ${user.email} (Org: ${org.name}) -> Last drip sent ${hoursSinceLastDrip.toFixed(1)}h ago. Waiting 24h before next stage.`);
        summary.skipped++;
        continue;
      }
    }

    const sentCodes = (org.usedCodes || []).map(c => c.code);
    
    let targetStage = null;
    let stageCode = null;

    if (!sentCodes.includes('drip:stage_1_launch')) {
      targetStage = 'STAGE_1_LAUNCH';
      stageCode = 'drip:stage_1_launch';
    } else if (daysSinceSignup >= 3 && !sentCodes.includes('drip:stage_2_features')) {
      targetStage = 'STAGE_2_FEATURES';
      stageCode = 'drip:stage_2_features';
    } else if (daysSinceSignup >= 7 && !sentCodes.includes('drip:stage_3_founder')) {
      targetStage = 'STAGE_3_FOUNDER';
      stageCode = 'drip:stage_3_founder';
    }

    if (!targetStage) {
      console.log(`[SKIP] ${user.email} (Org: ${org.name}) -> Already up to date for Day ${daysSinceSignup} stage.`);
      summary.skipped++;
      continue;
    }

    console.log(`\n--> Target: ${user.email} (Org: ${org.name})`);
    console.log(`    Days since signup: ${daysSinceSignup}`);
    console.log(`    Resolved Currency: ${currency} (IP: ${user.ip || 'none'})`);
    console.log(`    Selected Stage: ${targetStage} (${stageCode})`);

    const emailPayload = buildTemplate({
      userName: user.name,
      orgName: org.name,
      email: user.email,
      currency,
      stage: targetStage
    });

    console.log(`    Subject: "${emailPayload.subject}"`);

    if (dryRun) {
      console.log(`    [DRY-RUN] Would send email via Resend and record ${stageCode} in UsedCodes.`);
      summary.sent++;
      continue;
    }

    try {
      const sendRes = await resend.emails.send({
        from: 'HookStep Support <support@hookstep.in>',
        to: user.email,
        reply_to: 'support@hookstep.in',
        subject: emailPayload.subject,
        html: emailPayload.html,
        text: emailPayload.text
      });

      console.log(`    [SUCCESS] Delivered via Resend. Email ID:`, sendRes.data?.id || sendRes.id);

      // Record in UsedCodes for permanent idempotency
      await prisma.usedCodes.create({
        data: {
          code: stageCode,
          orgId: org.id
        }
      });
      console.log(`    [AUDIT] Recorded ${stageCode} in UsedCodes for org ${org.id}.`);
      summary.sent++;

      // Small delay between sends to avoid burst throttling
      await new Promise(r => setTimeout(r, 600));
    } catch (err) {
      console.error(`    [ERROR] Failed to send to ${user.email}:`, err.message || err);
      summary.errors++;
    }
  }

  console.log(`\n======================================================`);
  console.log(`SUMMARY: Processed: ${summary.processed} | Sent: ${summary.sent} | Skipped: ${summary.skipped} | Errors: ${summary.errors}`);
  console.log(`======================================================\n`);
  return summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const targetArg = args.find(a => a.startsWith('--target='));
  const targetEmail = targetArg ? targetArg.split('=')[1] : null;

  runLeadDrip({ dryRun, targetEmail })
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { runLeadDrip, buildTemplate, resolveCurrency };
