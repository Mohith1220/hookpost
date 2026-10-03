import React, { FC, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { ModalWrapperComponent } from '@hookpost/frontend/components/new-launch/modal.wrapper.component';
import { useModals } from '@hookpost/frontend/components/layout/new-modal';
import { Button } from '@hookpost/react/form/button';
import {
  TwaPlanNotice,
  useIsTwa,
} from '@hookpost/frontend/components/layout/twa.component';

export const PreConditionComponentModal: FC = () => {
  const modal = useModals();
  const isTwa = useIsTwa();
  // Google Play app: no fast-track charge from inside it (see layout/twa.ts).
  if (isTwa) {
    return (
      <div className="flex flex-col gap-[16px]">
        <div>
          This social channel was connected previously to another Hookpost
          account.
        </div>
        <TwaPlanNotice />
        <div className="flex justify-center">
          <Button onClick={modal.closeCurrent}>OK</Button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-[16px]">
      <div className="whitespace-pre-line">
        This social channel was connected previously to another Hookpost account.
        {'\n'}
        To continue, please fast-track your trial for an immediate charge.{'\n'}
        {'\n'}
        ** Please be advised that the account will not eligible for a refund,
        and the charge is final.
      </div>
      <div className="flex gap-[2px] justify-center">
        <Button
          onClick={() => (window.location.href = '/billing?finishTrial=true')}
        >
          Fast track - Charge me now
        </Button>
        <Button onClick={modal.closeCurrent} secondary={true}>Cancel</Button>
      </div>
    </div>
  );
};
export const PreConditionComponent: FC = () => {
  const modal = useModals();
  const query = useSearchParams();
  useEffect(() => {
    if (query.get('precondition')) {
      modal.openModal({
        title: 'Suspicious activity detected',
        withCloseButton: true,
        classNames: {
          modal: 'text-textColor',
        },
        children: <PreConditionComponentModal />,
      });
    }
  }, []);
  return null;
};
