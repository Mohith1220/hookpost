export const dynamic = 'force-dynamic';
import { AffiliateComponent } from '@hookpost/frontend/components/affiliates/affiliate.component';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Hookpost Affiliate Programme',
  description: '',
};

export default async function Page() {
  return (
    <div className="bg-newBgColorInner flex-1 flex-col flex p-[20px] gap-[12px]">
      <AffiliateComponent />
    </div>
  );
}
