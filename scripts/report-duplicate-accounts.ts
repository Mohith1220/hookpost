/**
 * READ-ONLY. Lists every email that belongs to more than one live user, the
 * accounts that "one account per email" now prevents: the same person as a
 * LOCAL (password) user and a GOOGLE user, each with its own workspace.
 *
 * It only reads. It merges nothing, deletes nothing and writes nothing; merging
 * is a per-case decision (see the plan it prints).
 *
 * Emails are masked (j***@gmail.com) unless you pass --show-emails.
 *
 * Run locally:
 *   npx ts-node --compiler-options '{"module":"commonjs"}' \
 *     scripts/report-duplicate-accounts.ts
 *
 * Run on the server (no TypeScript toolchain there): bundle it, copy it over,
 * and let dotenv load DATABASE_URL from the backend's .env:
 *   node_modules/.bin/esbuild scripts/report-duplicate-accounts.ts --bundle \
 *     --platform=node --format=cjs --external:@prisma/client \
 *     --outfile=/tmp/report-duplicate-accounts.js
 *   scp /tmp/report-duplicate-accounts.js server:/tmp/
 *   ssh server 'cd ~/hookpost && NODE_PATH=node_modules \
 *     DOTENV_CONFIG_PATH=.env node -r dotenv/config /tmp/report-duplicate-accounts.js'
 */
import { PrismaClient } from '@prisma/client';

const showEmails = process.argv.includes('--show-emails');

const normalise = (email: string) => (email || '').trim().toLowerCase();

export const maskEmail = (email: string) => {
  const [local, domain] = normalise(email).split('@');
  return `${(local || '?').slice(0, 1)}***@${domain || '?'}`;
};

async function main() {
  const prisma = new PrismaClient();
  try {
    const users = await prisma.user.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        email: true,
        providerName: true,
        activated: true,
        createdAt: true,
        lastOnline: true,
        organizations: {
          select: {
            role: true,
            organization: {
              select: {
                id: true,
                deletedAt: true,
                subscription: {
                  select: {
                    subscriptionTier: true,
                    period: true,
                    identifier: true,
                    cancelAt: true,
                    deletedAt: true,
                  },
                },
                _count: {
                  select: { post: { where: { deletedAt: null } }, users: true },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const byEmail = new Map<string, typeof users>();
    for (const user of users) {
      const key = normalise(user.email);
      byEmail.set(key, [...(byEmail.get(key) || []), user]);
    }
    const duplicates = [...byEmail.entries()].filter(([, list]) => list.length > 1);

    console.log(
      `Live users: ${users.length}. Distinct emails: ${byEmail.size}. ` +
        `Emails with more than one user: ${duplicates.length}.`
    );

    for (const [email, list] of duplicates) {
      console.log(`\n${showEmails ? email : maskEmail(email)}  (${list.length} users)`);
      for (const user of list) {
        const orgs = user.organizations.filter((o) => !o.organization.deletedAt);
        console.log(
          `  ${user.providerName.padEnd(8)} user ${user.id.slice(0, 8)}  created ${user.createdAt
            .toISOString()
            .slice(0, 10)}  last online ${user.lastOnline
            .toISOString()
            .slice(0, 10)}  ${user.activated ? 'activated' : 'NOT activated'}`
        );
        if (!orgs.length) {
          console.log('           no workspace');
        }
        for (const { role, organization: org } of orgs) {
          const sub = org.subscription && !org.subscription.deletedAt
            ? `${org.subscription.subscriptionTier} ${org.subscription.period}${
                org.subscription.identifier ? ' (Razorpay)' : ''
              }${org.subscription.cancelAt ? ' cancelling' : ''}`
            : 'free';
          console.log(
            `           org ${org.id.slice(0, 8)}  ${role}  members ${org._count.users}  posts ${org._count.post}  ${sub}`
          );
        }
      }
      console.log(`  plan: ${planFor(list)}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * A suggestion to read, never an action. The survivor is the account with the
 * paid subscription, else the one with posts, else the oldest; the other
 * accounts' workspaces are moved or kept as a second workspace of the
 * survivor, never deleted without asking the person.
 */
function planFor(
  list: {
    providerName: string;
    organizations: {
      organization: {
        deletedAt: Date | null;
        subscription: { deletedAt: Date | null; identifier: string | null } | null;
        _count: { post: number };
      };
    }[];
  }[]
) {
  const score = (u: (typeof list)[number]) => {
    const orgs = u.organizations.filter((o) => !o.organization.deletedAt);
    const paid = orgs.some(
      (o) => o.organization.subscription && !o.organization.subscription.deletedAt
    );
    const posts = orgs.reduce((sum, o) => sum + o.organization._count.post, 0);
    return { paid, posts };
  };
  const scored = list.map((u) => ({ u, ...score(u) }));
  const paid = scored.filter((s) => s.paid);
  const active = scored.filter((s) => s.posts > 0);
  if (paid.length > 1) {
    return 'more than one account pays: ask the customer which to keep before touching billing';
  }
  const keep = paid[0] || active.sort((a, b) => b.posts - a.posts)[0] || scored[0];
  const others = scored.filter((s) => s !== keep);
  const othersEmpty = others.every((s) => !s.posts && !s.paid);
  return `keep the ${keep.u.providerName} user; ${
    othersEmpty
      ? 'the other account(s) have no posts and no subscription, so soft-delete them (deleteAccount) after telling the person'
      : 'the other account(s) have activity: add the survivor to their workspace as SUPERADMIN, then retire the empty user'
  }`;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
