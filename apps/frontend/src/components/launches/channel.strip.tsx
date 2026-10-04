'use client';

import { FC, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { Integration } from '@prisma/client';
import ImageWithFallback from '@hookpost/react/helpers/image.with.fallback';
import SafeImage from '@hookpost/react/helpers/safe.image';
import { useT } from '@hookpost/react/translation/get.transation.service.client';
import { AddProviderButton } from '@hookpost/frontend/components/launches/add.provider.component';
import { NewPost } from '@hookpost/frontend/components/launches/new.post';

type StripIntegration = Integration & {
  identifier: string;
  refreshNeeded?: boolean;
};

/**
 * The channel panel as one 64px row, used below lg where the 260px side panel
 * (or, on a phone, a 210px block above the calendar) left the week grid about
 * 250px of height.
 *
 * Create Post stays on the left, the channel avatars scroll sideways in the
 * middle with Add Channel as the last item, and the chevron on the right opens
 * the full panel (names, per-channel preferences, customer groups).
 */
export const ChannelStrip: FC<{
  integrations: StripIntegration[];
  onOpen: () => void;
  update: () => void;
  refreshChannel: (integration: StripIntegration) => () => void;
  continueIntegration: (integration: Integration) => () => void;
}> = (props) => {
  const { integrations, onOpen, update, refreshChannel, continueIntegration } =
    props;
  const t = useT();

  // The avatars scroll sideways, and a scrollbar would not fit in a 64px strip,
  // so fade the end of the row while there is more to scroll to.
  const scroller = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  const [rtl, setRtl] = useState(false);
  useEffect(() => {
    const el = scroller.current;
    if (!el) {
      return;
    }
    const update = () => {
      setRtl(getComputedStyle(el).direction === 'rtl');
      setMore(el.scrollWidth - el.clientWidth - Math.abs(el.scrollLeft) > 4);
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      observer.disconnect();
    };
  }, [integrations.length]);

  return (
    <div className="flex shrink-0 items-center gap-[8px] bg-newBgColorInner h-[64px] px-[12px] md:px-[20px]">
      <NewPost compact />
      {/* min-w-0 is what lets this row shrink and scroll instead of pushing
          the chevron out of the strip. */}
      <div
        ref={scroller}
        className={clsx(
          'flex flex-1 min-w-0 items-center gap-[10px] overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          more &&
            (rtl
              ? '[mask-image:linear-gradient(to_left,#000_calc(100%-28px),transparent)]'
              : '[mask-image:linear-gradient(to_right,#000_calc(100%-28px),transparent)]')
        )}
      >
        {integrations.map((integration) => {
          const flagged =
            integration.refreshNeeded || integration.inBetweenSteps;
          return (
            <button
              key={integration.id}
              type="button"
              onClick={
                integration.refreshNeeded
                  ? refreshChannel(integration)
                  : integration.inBetweenSteps
                  ? continueIntegration(integration)
                  : onOpen
              }
              aria-label={integration.name}
              title={integration.name}
              className="relative shrink-0 h-[44px] flex items-center me-[5px]"
            >
              <div
                className={clsx(
                  'relative flex items-center',
                  integration.disabled && 'opacity-50'
                )}
              >
                <ImageWithFallback
                  fallbackSrc={'/no-picture.jpg'}
                  src={integration.picture || '/no-picture.jpg'}
                  className="rounded-[8px] min-w-[36px] min-h-[36px]"
                  alt={integration.identifier}
                  width={36}
                  height={36}
                />
                {integration.identifier === 'youtube' ? (
                  <img
                    src="/icons/platforms/youtube.svg"
                    className="absolute z-10 bottom-[-2px] -end-[5px]"
                    width={20}
                  />
                ) : (
                  <SafeImage
                    src={`/icons/platforms/${integration.identifier}.png`}
                    className="rounded-[8px] absolute z-10 bottom-[-2px] -end-[5px] border border-fifth"
                    alt={integration.identifier}
                    width={18.41}
                    height={18.41}
                  />
                )}
              </div>
              {flagged && (
                <div className="bg-red-500 w-[15px] h-[15px] rounded-full -start-[4px] top-[2px] absolute z-[200] text-[10px] flex justify-center items-center text-white">
                  !
                </div>
              )}
            </button>
          );
        })}
        <AddProviderButton update={update} compact />
      </div>
      <button
        type="button"
        onClick={onOpen}
        aria-label={t('channels', 'Channels')}
        title={t('channels', 'Channels')}
        className="shrink-0 h-[44px] w-[32px] flex items-center justify-center text-btnText bg-btnSimple rounded-[8px]"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="13"
          height="7"
          viewBox="0 0 13 7"
          fill="none"
        >
          <path
            d="M1.5 1L6.5 6L11.5 1"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  );
};
