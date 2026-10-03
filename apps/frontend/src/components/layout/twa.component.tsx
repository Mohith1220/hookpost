'use client';

import React, { FC, ReactNode, useSyncExternalStore } from 'react';
import { areYouSure } from '@hookpost/frontend/components/layout/new-modal';
import {
  isTwaClient,
  TWA_PLAN_NOTICE,
} from '@hookpost/frontend/components/layout/twa';

// The flag only changes on a full page load (the bootstrap script in the
// layout sets it), so there is nothing to subscribe to.
const subscribe = () => (): void => undefined;

/**
 * True inside the Google Play app. False during server rendering and
 * hydration, then the real value - so a server-rendered tree never mismatches.
 * Server components read the `hookpost_twa` cookie instead (see
 * isTwaServerSide).
 */
export const useIsTwa = (): boolean =>
  useSyncExternalStore(subscribe, isTwaClient, () => false);

/** The plain, unlinked line shown in the Play app where a paywall would be. */
export const TwaPlanNotice: FC<{ className?: string }> = ({ className }) => (
  <div className={className || 'text-[14px] text-textItemBlur'}>
    {TWA_PLAN_NOTICE}
  </div>
);

/**
 * Inside the Play app, replaces an upgrade prompt that would have sent the user
 * to /billing: says why the action stopped, adds the plan line, and offers
 * only OK. Nothing in it links anywhere.
 */
export const twaPlanDialog = (message: ReactNode, title = 'Plan limit') =>
  areYouSure({
    title,
    description: (
      <div className="flex flex-col gap-[8px]">
        <div>{message}</div>
        <TwaPlanNotice />
      </div>
    ),
    approveLabel: 'OK',
    onlyApprove: true,
  });
