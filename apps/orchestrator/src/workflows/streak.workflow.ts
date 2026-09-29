import { proxyActivities, sleep } from '@temporalio/workflow';
import { EmailActivity } from '@hookpost/orchestrator/activities/email.activity';

const { sendEmailAsync, getUserOrgs, setStreak } = proxyActivities<EmailActivity>({
  startToCloseTimeout: '10 minute',
  taskQueue: 'main',
  cancellationType: 'ABANDON',
});

export async function streakWorkflow({
  organizationId,
}: {
  organizationId: string;
}) {
  await setStreak(organizationId, 'start');
  await sleep(79200000);
  const userOrgs = await getUserOrgs(organizationId);
  for (const user of userOrgs.users) {
    if (!user.user.sendStreakEmails) {
      continue;
    }
    await sendEmailAsync(
      user.user.email,
      'Your posting streak ends in 2 hours',
      // Wrapped in the shared email layout by EmailService.sendEmailSync.
      '<p>Schedule a post in the next 2 hours to keep your streak going.</p>',
      'bottom'
    );
  }
  await sleep(7200000);
  await setStreak(organizationId, 'end');
}
