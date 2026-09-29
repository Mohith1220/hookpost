import {
  condition,
  continueAsNew,
  proxyActivities,
  setHandler,
  sleep,
} from '@temporalio/workflow';
import { Email, emailSignal } from '@hookpost/orchestrator/signals/email.signal';
import { EmailActivity } from '@hookpost/orchestrator/activities/email.activity';

const { getUserOrgs, sendEmailAsync } = proxyActivities<EmailActivity>({
  startToCloseTimeout: '10 minute',
  taskQueue: 'main',
  cancellationType: 'ABANDON',
  retry: {
    maximumAttempts: 3,
    backoffCoefficient: 1,
    initialInterval: '2 minutes',
  },
});

export async function digestEmailWorkflow({
  organizationId,
  queue = [],
}: {
  organizationId: string;
  queue?: Email[];
}) {
  setHandler(emailSignal, (data) => {
    queue.push(...data);
  });

  while (true) {
    await condition(() => queue.length > 0);
    await sleep(3600000);

    // Take a snapshot batch and immediately clear queue.
    const batch = queue.splice(0, queue.length);
    queue = [];

    const org = await getUserOrgs(organizationId);

    for (const user of org.users) {
      const allowFailure = user.user.sendFailureEmails ? 'fail' : null;
      const allowSuccess = user.user.sendSuccessEmails ? 'success' : null;

      const toSend = batch.filter(
        (email) =>
          email.type === allowFailure ||
          email.type === allowSuccess ||
          email.type === 'info'
      );

      if (toSend.length === 0) continue;

      await sendEmailAsync(
        user.user.email,
        toSend.length === 1
          ? toSend[0].title
          : `${toSend.length} updates from Hookpost`,
        // One paragraph per update; EmailService wraps it in the shared layout.
        toSend
          .map((p, i) =>
            i < toSend.length - 1
              ? `<p style="margin:0 0 12px 0;padding:0 0 12px 0;border-bottom:1px solid #E6E9EF;">${p.message}</p>`
              : `<p style="margin:0 0 16px 0;">${p.message}</p>`
          )
          .join(''),
        'bottom'
      );
    }

    return await continueAsNew({
      organizationId,
      queue,
    });
  }
}
