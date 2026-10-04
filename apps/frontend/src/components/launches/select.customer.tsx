'use client';

import { uniqBy } from 'lodash';
import React, { FC, useCallback, useMemo, useRef, useState } from 'react';
import { Integrations } from '@hookpost/frontend/components/launches/calendar.context';
import { useT } from '@hookpost/react/translation/get.transation.service.client';
import clsx from 'clsx';
import { useClickOutside } from '@mantine/hooks';
import { useToaster } from '@hookpost/react/toaster/toaster';
import { useLaunchStore } from '@hookpost/frontend/components/new-launch/store';
import { useShallow } from 'zustand/react/shallow';
import { UserIcon, DropdownArrowIcon } from '@hookpost/frontend/components/ui/icons';

export const SelectCustomer: FC<{
  onChange: (value: string) => void;
  integrations: Integrations[];
  customer?: string;
  className?: string;
  // The calendar toolbar on a phone: just the icon, no dropdown arrow, so it
  // can share a row with the Day/Week/Month switch. The composer keeps the
  // full trigger.
  compact?: boolean;
}> = (props) => {
  const {
    onChange,
    integrations,
    customer: currentCustomer,
    className,
    compact,
  } = props;
  const { setCurrent } = useLaunchStore(
    useShallow((state) => ({
      setCurrent: state.setCurrent,
    }))
  );
  const toaster = useToaster();
  const t = useT();
  const [customer, setCustomer] = useState(currentCustomer || '');
  const [pos, setPos] = useState<any>({});
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(() => {
    if (open) {
      setOpen(false);
    }
  });

  const openClose = useCallback(() => {
    if (open) {
      setOpen(false);
      return;
    }

    const { x, y, width, height } = ref.current?.getBoundingClientRect();
    setPos({ top: y + height, left: x });
    setOpen(true);
  }, [open]);

  const totalCustomers = useMemo(() => {
    return uniqBy(integrations, (i) => i?.customer?.id).length;
  }, [integrations]);
  if (totalCustomers <= 1) {
    return null;
  }

  return (
    <div
      className={clsx(
        'relative select-none z-[500]',
        compact && 'shrink-0',
        className
      )}
      ref={ref}
    >
      <div
        data-tooltip-id="tooltip"
        data-tooltip-content={t('select_customer_tooltip', 'Select Customer')}
        onClick={openClose}
        className={clsx(
          'relative z-[20] cursor-pointer h-[42px] rounded-[8px] gap-[8px] border flex items-center',
          compact
            ? 'px-[10px] md:pl-[16px] md:pr-[12px]'
            : 'pl-[16px] pr-[12px]',
          open ? 'border-[#612BD3]' : 'border-newColColor'
        )}
      >
        <div>
          <UserIcon />
        </div>
        <div className={clsx(compact && 'hidden md:block')}>
          <DropdownArrowIcon rotated={open} />
        </div>
      </div>
      {open && (
        <div
          style={pos}
          className="flex flex-col fixed pt-[12px] bg-newBgColorInner menu-shadow min-w-[250px]"
        >
          <div className="text-[14px] font-[600] px-[12px] mb-[5px]">
            {t('customers', 'Customers')}
          </div>
          {uniqBy(integrations, (u) => u?.customer?.name)
            .filter((f) => f.customer?.name)
            .map((p) => (
              <div
                onClick={() => {
                  toaster.show(
                    t('customer_socials_selected', 'Customer socials selected'),
                    'success'
                  );
                  setCustomer(p.customer?.id);
                  onChange(p.customer?.id);
                  setOpen(false);
                  setCurrent('global')
                }}
                key={p.customer?.id}
                className="p-[12px] hover:bg-newBgColor text-[14px] font-[500] h-[32px] flex items-center"
              >
                {p.customer?.name}
              </div>
            ))}
        </div>
      )}
    </div>
  );
};
