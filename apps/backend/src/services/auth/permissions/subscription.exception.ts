import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import { AuthorizationActions, Sections, SubscriptionException } from '@hookpost/backend/services/auth/permissions/permission.exception.class';
import { pricingINR } from '@hookpost/nestjs-libraries/database/prisma/subscriptions/pricing';

@Catch(SubscriptionException)
export class SubscriptionExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const status = exception.getStatus();
    const error: { section: Sections; action: AuthorizationActions } =
      exception.getResponse() as any;

    // A Free workspace hitting a limit is the moment to offer Standard's 7-day
    // trial, so say what the Free plan includes and what the trial unlocks.
    // allowTrial is true until the workspace has used its trial.
    const org = ctx.getRequest()?.org;
    const onFree = !!org && !org.subscription;
    const canTrial = onFree && !!org.allowTrial;
    const message =
      (onFree && getFreePlanMessage(error, canTrial)) || getErrorMessage(error);

    response.status(status).json({
      statusCode: status,
      message,
      trial: canTrial,
      url: process.env.FRONTEND_URL + '/billing',
    });
  }
}

const getErrorMessage = (error: {
  section: Sections;
  action: AuthorizationActions;
}) => {
  switch (error.section) {
    case Sections.POSTS_PER_MONTH:
      switch (error.action) {
        default:
          return 'You have reached the maximum number of posts for your subscription. Please upgrade your subscription to add more posts.';
      }
    case Sections.CHANNEL:
      switch (error.action) {
        default:
          return 'You have reached the maximum number of channels for your subscription. Please upgrade your subscription to add more channels.';
      }
    case Sections.WEBHOOKS:
      switch (error.action) {
        default:
          return 'You have reached the maximum number of webhooks for your subscription. Please upgrade your subscription to add more webhooks.';
      }
    case Sections.VIDEOS_PER_MONTH:
      switch (error.action) {
        default:
          return 'You have reached the maximum number of generated videos for your subscription. Please upgrade your subscription to generate more videos.';
      }
  }
};

const getFreePlanMessage = (
  error: { section: Sections; action: AuthorizationActions },
  canTrial: boolean
) => {
  const { FREE, STANDARD } = pricingINR;
  const next = (what: string) =>
    canTrial
      ? `Start a 7-day free trial of Standard to get ${what} - no charge until the trial ends, cancel anytime.`
      : `Upgrade to Standard to get ${what}.`;
  switch (error.section) {
    case Sections.CHANNEL:
      return `The Free plan includes ${FREE.channel} channels. ${next(`up to ${STANDARD.channel} channels`)}`;
    case Sections.POSTS_PER_MONTH:
      return `You've used all ${FREE.posts_per_month} posts on the Free plan this month. ${next(`${STANDARD.posts_per_month} posts a month`)}`;
    default:
      return undefined;
  }
};
