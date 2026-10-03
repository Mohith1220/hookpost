'use client';

import { useCallback, useEffect } from 'react';
import useSWR from 'swr';
import { LoadingComponent } from '@hookpost/frontend/components/layout/loading';
import { useFetch } from '@hookpost/helpers/utils/custom.fetch';
import { MainBillingComponent } from './main.billing.component';
import {
  TwaPlanNotice,
  useIsTwa,
} from '@hookpost/frontend/components/layout/twa.component';

// Inside the Google Play app there are no plans and no checkout - Play's
// Payments policy allows only Play Billing there - just the plain line.
export const BillingComponent = () => {
  const isTwa = useIsTwa();
  if (isTwa) {
    return <TwaPlanNotice />;
  }
  return <BillingPlans />;
};

const BillingPlans = () => {
  const fetch = useFetch();
  const load = useCallback(async (path: string) => {
    return await (await fetch(path)).json();
  }, []);
  const { isLoading: isLoadingTier, data: tiers } = useSWR(
    '/user/subscription/tiers',
    load
  );
  const { isLoading: isLoadingSubscription, data: subscription } = useSWR(
    '/user/subscription',
    load
  );
  if (isLoadingSubscription || isLoadingTier) {
    return <LoadingComponent />;
  }
  return <MainBillingComponent sub={subscription?.subscription} />;
};
