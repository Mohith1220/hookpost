'use client';
import { FC, ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import Link from 'next/link';

export const MenuItem: FC<{ label: string; icon: ReactNode; path: string; onClick?: () => void }> = ({
  label,
  icon,
  path,
  onClick,
}) => {
  const currentPath = usePathname();
  const isActive = currentPath.indexOf(path) === 0;

  const className = clsx(
    'group w-full minCustom:h-[54px] custom:h-[44px] py-[8px] px-[2px] minCustom:gap-[4px] custom:gap-[2px] flex flex-col font-[600] items-center justify-center rounded-[12px] hover:text-textItemFocused hover:bg-boxFocused transition-colors',
    isActive ? 'text-textItemFocused bg-boxFocused' : 'text-textItemBlur'
  );

  const inner = (
    <>
      <div className="custom:scale-90 transition-transform">{icon}</div>
      {/* "Integrations" is 52.7px wide at 9px and 58.5px at 10px. The rail gives a
          label 46px on phones (58px rail) and 52px from md up (64px rail) when the
          link has 6px side padding, so the word broke mid-way ("Integratio / ns").
          Side padding is now 2px (54px / 60px of room) and phones use 8.5px
          (49.7px). The 9px / 10px height-based sizes still apply from md up. */}
      <div className="text-[8.5px] md:custom:text-[9px] md:minCustom:text-[10px] tracking-[-0.1px] leading-[1.1] text-center w-full [overflow-wrap:anywhere]">
        {label}
      </div>
    </>
  );

  if (onClick) {
    return (
      <button onClick={onClick} title={label} className={className}>
        {inner}
      </button>
    );
  }

  return (
    <Link
      prefetch={true}
      href={path}
      title={label}
      {...path.indexOf('http') === 0 && { target: '_blank' }}
      className={className}
    >
      {inner}
    </Link>
  );
};
