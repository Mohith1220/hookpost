export const dynamic = 'force-dynamic';
import { AdminAffiliatesComponent } from '@hookpost/frontend/components/admin/admin-affiliates.component';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Hookpost Admin Affiliates',
  description: '',
};

export default async function Page() {
  return (
    <div className="bg-newBgColorInner flex-1 flex-col flex p-[20px] gap-[12px]">
      <AdminAffiliatesComponent />
    </div>
  );
}
