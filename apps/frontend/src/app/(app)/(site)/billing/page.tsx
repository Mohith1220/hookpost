export const dynamic = 'force-dynamic';
import { BillingComponent } from '@hookpost/frontend/components/billing/billing.component';
import { TwaPlanNotice } from '@hookpost/frontend/components/layout/twa.component';
import { isTwaServerSide } from '@hookpost/frontend/components/layout/twa.server';
import { Metadata } from 'next';
import { isGeneralServerSide } from '@hookpost/helpers/utils/is.general.server.side';
export const metadata: Metadata = {
  title: `${isGeneralServerSide() ? 'Hookpost' : 'Gitroom'} Billing`,
  description: '',
};
export default async function Page() {
  // Google Play app: no plans or checkout, server-rendered or not. The client
  // check in BillingComponent covers the first launch, before the cookie exists.
  const isTwa = await isTwaServerSide();
  return (
    <div className="bg-newBgColorInner flex-1 flex-col flex p-[20px] gap-[12px]">
      {isTwa ? <TwaPlanNotice /> : <BillingComponent />}
    </div>
  );
}
