'use client';

import {
  AddProviderButton,
  CustomVariables,
} from '@hookpost/frontend/components/launches/add.provider.component';
import { useModals } from '@hookpost/frontend/components/layout/new-modal';
import { FC, useCallback, useEffect, useMemo, useState } from 'react';
import SafeImage from '@hookpost/react/helpers/safe.image';
import { capitalize, groupBy, orderBy } from 'lodash';
import { CalendarWeekProvider } from '@hookpost/frontend/components/launches/calendar.context';
import { Filters } from '@hookpost/frontend/components/launches/filters';
import { useFetch } from '@hookpost/helpers/utils/custom.fetch';
import { LoadingComponent } from '@hookpost/frontend/components/layout/loading';
import clsx from 'clsx';
import { useUser } from '../layout/user.context';
import { Menu } from '@hookpost/frontend/components/launches/menu/menu';
import { useRouter, useSearchParams } from 'next/navigation';
import { Integration } from '@prisma/client';
import ImageWithFallback from '@hookpost/react/helpers/image.with.fallback';
import { useToaster } from '@hookpost/react/toaster/toaster';
import { useFireEvents } from '@hookpost/helpers/utils/use.fire.events';
import { Calendar } from './calendar';
import { ChannelStrip } from '@hookpost/frontend/components/launches/channel.strip';
import { useDrag, useDrop } from 'react-dnd';
import { DNDProvider } from '@hookpost/frontend/components/launches/helpers/dnd.provider';
import { GeneratorComponent } from './generator/generator';
import { useVariables } from '@hookpost/react/helpers/variable.context';
import { NewPost } from '@hookpost/frontend/components/launches/new.post';
import { useT } from '@hookpost/react/translation/get.transation.service.client';
import { useIntegrationList } from '@hookpost/frontend/components/launches/helpers/use.integration.list';
import useCookie from 'react-use-cookie';
import { Onboarding } from '@hookpost/frontend/components/onboarding/onboarding';
import { useIsTwa } from '@hookpost/frontend/components/layout/twa.component';

export const SVGLine = () => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="5"
      height="52"
      viewBox="0 0 5 52"
      fill="none"
      className="rtl:rotate-180"
    >
      <path
        d="M0.5 4C0.5 1.79086 2.29086 0 4.5 0V52C2.29086 52 0.5 50.2091 0.5 48V4Z"
        fill="url(#paint0_linear_1930_1119)"
      />
      <path
        d="M0.5 4C0.5 1.79086 2.29086 0 4.5 0V52C2.29086 52 0.5 50.2091 0.5 48V4Z"
        fill="url(#paint1_radial_1930_1119)"
      />
      <defs>
        <linearGradient
          id="paint0_linear_1930_1119"
          x1="-7"
          y1="-27.7727"
          x2="-2.58929"
          y2="-28.6843"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#662FDA" />
          <stop offset="1" stopColor="#5720CB" />
        </linearGradient>
        <radialGradient
          id="paint1_radial_1930_1119"
          cx="0"
          cy="0"
          r="1"
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(1.19333 7.45342) rotate(21.2064) scale(16.1503 188.627)"
        >
          <stop stopColor="#8C66FF" />
          <stop offset="1" stopColor="#8C66FF" stopOpacity="0" />
        </radialGradient>
      </defs>
    </svg>
  );
};
interface MenuComponentInterface {
  refreshChannel: (
    integration: Integration & {
      identifier: string;
    }
  ) => () => void;
  collapsed: boolean;
  continueIntegration: (integration: Integration) => () => void;
  totalNonDisabledChannels: number;
  mutate: (shouldReload?: boolean) => void;
  update: (shouldReload: boolean) => void;
}
export const OpenClose: FC<{
  isOpen: boolean;
}> = (props) => {
  const { isOpen } = props;
  return (
    <svg
      width="11"
      height="6"
      viewBox="0 0 22 12"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={clsx(
        'rotate-180 transition-all',
        isOpen ? 'rotate-180' : 'rotate-90'
      )}
    >
      <path
        d="M21.9245 11.3823C21.8489 11.5651 21.7207 11.7213 21.5563 11.8312C21.3919 11.9411 21.1986 11.9998 21.0008 11.9998H1.00079C0.802892 12 0.609399 11.9414 0.444805 11.8315C0.280212 11.7217 0.151917 11.5654 0.076165 11.3826C0.000412494 11.1998 -0.0193921 10.9986 0.0192583 10.8045C0.0579087 10.6104 0.153276 10.4322 0.293288 10.2923L10.2933 0.29231C10.3862 0.199333 10.4964 0.125575 10.6178 0.0752506C10.7392 0.0249263 10.8694 -0.000976562 11.0008 -0.000976562C11.1322 -0.000976562 11.2623 0.0249263 11.3837 0.0752506C11.5051 0.125575 11.6154 0.199333 11.7083 0.29231L21.7083 10.2923C21.8481 10.4322 21.9433 10.6105 21.9818 10.8045C22.0202 10.9985 22.0003 11.1996 21.9245 11.3823Z"
        fill="currentColor"
      />
    </svg>
  );
};
export const MenuGroupComponent: FC<
  MenuComponentInterface & {
    changeItemGroup: (id: string, group: string) => void;
    group: {
      id: string;
      name: string;
      values: Array<
        Integration & {
          identifier: string;
          changeProfilePicture: boolean;
          changeNickName: boolean;
        }
      >;
    };
  }
> = (props) => {
  const {
    group,
    mutate,
    update,
    continueIntegration,
    totalNonDisabledChannels,
    refreshChannel,
    changeItemGroup,
    collapsed,
  } = props;
  const [isOpen, setIsOpen] = useState(
    !!+(localStorage.getItem(group.name + '_isOpen') || '1')
  );
  const changeOpenClose = useCallback(
    (e: any) => {
      setIsOpen(!isOpen);
      localStorage.setItem(group.name + '_isOpen', isOpen ? '0' : '1');
      e.stopPropagation();
    },
    [isOpen]
  );
  const [collectedProps, drop] = useDrop(() => ({
    accept: 'menu',
    drop: (
      item: {
        id: string;
      },
      monitor
    ) => {
      changeItemGroup(item.id, group.id);
    },
    collect: (monitor) => ({
      isOver: !!monitor.isOver(),
    }),
  }));
  return (
    <div
      className="gap-[16px] flex flex-col relative"
      // @ts-ignore
      ref={drop}
    >
      {collectedProps.isOver && (
        <div className="absolute start-0 top-0 w-full h-full pointer-events-none">
          <div className="w-full h-full start-0 top-0 relative">
            <div className="bg-white/30 w-full h-full p-[8px] box-content rounded-md" />
          </div>
        </div>
      )}
      {!!group.name && (
        <div
          className="flex items-center gap-[5px] cursor-pointer"
          onClick={changeOpenClose}
        >
          <div>
            <OpenClose isOpen={isOpen} />
          </div>
          <div
            className="line-clamp-1"
            {...(collapsed
              ? {
                  'data-tooltip-id': 'tooltip',
                  'data-tooltip-content': group.name,
                }
              : {})}
          >
            {group.name}
          </div>
        </div>
      )}
      <div
        className={clsx(
          'gap-[12px] flex flex-col relative',
          !isOpen && 'hidden'
        )}
      >
        {group.values.map((integration) => (
          <MenuComponent
            collapsed={collapsed}
            key={integration.id}
            integration={integration}
            mutate={mutate}
            continueIntegration={continueIntegration}
            update={update}
            refreshChannel={refreshChannel}
            totalNonDisabledChannels={totalNonDisabledChannels}
          />
        ))}
      </div>
    </div>
  );
};
export const MenuComponent: FC<
  MenuComponentInterface & {
    integration: Integration & {
      identifier: string;
      changeProfilePicture: boolean;
      changeNickName: boolean;
      refreshNeeded?: boolean;
    };
  }
> = (props) => {
  const {
    totalNonDisabledChannels,
    continueIntegration,
    refreshChannel,
    mutate,
    update,
    integration,
    collapsed,
  } = props;
  const user = useUser();
  const t = useT();
  const isTwa = useIsTwa();
  const [collected, drag, dragPreview] = useDrag(() => ({
    type: 'menu',
    item: {
      id: integration.id,
    },
  }));
  return (
    <div
      // @ts-ignore
      ref={dragPreview}
      {...(integration.refreshNeeded && {
        onClick: refreshChannel(integration),
        'data-tooltip-id': 'tooltip',
        'data-tooltip-content': t(
          'channel_disconnected_click_to_reconnect',
          'Channel disconnected, click to reconnect.'
        ),
      })}
      {...(collapsed
        ? {
            'data-tooltip-id': 'tooltip',
            'data-tooltip-content': integration.name,
          }
        : {})}
      className={clsx(
        'flex gap-[12px] items-center bg-newBgColorInner hover:bg-boxHover group/profile transition-all rounded-e-[8px]',
        integration.refreshNeeded && 'cursor-pointer'
      )}
    >
      <div
        className={clsx(
          'relative gap-[6px] flex justify-center items-center',
          integration.disabled && 'opacity-50'
        )}
      >
        <div className="h-full w-[4px] -ms-[12px] rounded-s-[3px] opacity-0 group-hover/profile:opacity-100 transition-opacity">
          <SVGLine />
        </div>
        {(integration.inBetweenSteps || integration.refreshNeeded) && (
          <div
            className="absolute start-0 top-0 w-[39px] h-[46px] cursor-pointer"
            onClick={
              integration.refreshNeeded
                ? refreshChannel(integration)
                : continueIntegration(integration)
            }
          >
            <div className="bg-red-500 w-[15px] h-[15px] rounded-full start-[5px] top-[5px] absolute z-[200] text-[10px] flex justify-center items-center">
              !
            </div>
            <div className="bg-primary/60 w-[39px] h-[46px] start-0 top-0 absolute rounded-full z-[199]" />
          </div>
        )}
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
            className="absolute z-10 bottom-[5px] -end-[5px]"
            width={20}
          />
        ) : (
          <SafeImage
            src={`/icons/platforms/${integration.identifier}.png`}
            className="rounded-[8px] absolute z-10 bottom-[5px] -end-[5px] border border-fifth"
            alt={integration.identifier}
            width={18.41}
            height={18.41}
          />
        )}
      </div>
      <div
        // @ts-ignore
        ref={drag}
        {...(integration.disabled &&
        totalNonDisabledChannels === user?.totalChannels
          ? {
              'data-tooltip-id': 'tooltip',
              // Google Play app: no "upgrade" prompt (see layout/twa.ts).
              'data-tooltip-content': isTwa
                ? 'This channel is disabled on your current plan.'
                : t(
                    'channel_disabled_upgrade_plan',
                    'This channel is disabled, please upgrade your plan to enable it.'
                  ),
            }
          : {})}
        role="Handle"
        className={clsx(
          'group-[.sidebar]:hidden flex-1 whitespace-nowrap text-ellipsis overflow-hidden cursor-move',
          integration.disabled && 'opacity-50'
        )}
      >
        {integration.name}
      </div>
      <Menu
        canChangeProfilePicture={integration.changeProfilePicture}
        canChangeNickName={integration.changeNickName}
        refreshChannel={refreshChannel}
        mutate={mutate}
        onChange={update}
        id={integration.id}
        canEnable={
          user?.totalChannels! > totalNonDisabledChannels &&
          integration.disabled
        }
        canDisable={!integration.disabled}
      />
    </div>
  );
};
// True from `px` wide up. It is read synchronously on the first render (this
// tree is only rendered in the browser, after the user has loaded) so a desktop
// window never paints the phone layout for a frame.
const useMinWidth = (px: number) => {
  const query = `(min-width: ${px}px)`;
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches
  );
  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = () => setMatches(media.matches);
    onChange();
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [query]);
  return matches;
};
export const LaunchesComponent = () => {
  const fetch = useFetch();
  const user = useUser();
  const { billingEnabled } = useVariables();
  const router = useRouter();
  const search = useSearchParams();
  const toast = useToaster();
  const fireEvents = useFireEvents();
  const t = useT();
  const modal = useModals();
  const [reload, setReload] = useState(false);
  const [collapseMenu, setCollapseMenu] = useCookie('collapseMenu', '0');
  // From lg the channel panel sits beside the calendar (260px, or the 100px icon
  // sidebar). Below lg it is one 64px strip above the calendar; the chevron in
  // the strip opens the full panel, and its own chevron closes it again.
  const isLg = useMinWidth(1024);
  const [channelsOpen, setChannelsOpen] = useState(false);
  const [mode] = useCookie('mode', 'dark');
  const { isLoading, data: integrations, mutate } = useIntegrationList();

  const totalNonDisabledChannels = useMemo(() => {
    return (
      integrations?.filter((integration: any) => !integration.disabled)
        ?.length || 0
    );
  }, [integrations]);
  const changeItemGroup = useCallback(
    async (id: string, group: string) => {
      mutate(
        integrations.map((integration: any) => {
          if (integration.id === id) {
            return {
              ...integration,
              customer: {
                id: group,
              },
            };
          }
          return integration;
        }),
        false
      );
      await fetch(`/integrations/${id}/group`, {
        method: 'PUT',
        body: JSON.stringify({
          group,
        }),
      });
      mutate();
    },
    [integrations]
  );
  const sortedIntegrations = useMemo(() => {
    return orderBy(
      integrations,
      ['type', 'disabled', 'identifier'],
      ['desc', 'asc', 'asc']
    );
  }, [integrations]);
  const hasChannels = sortedIntegrations.length > 0;
  // The icon-only sidebar is a lg+ layout. Below lg the panel always shows
  // channel names, whatever the desktop cookie says.
  const sidebarMode = isLg && collapseMenu === '1';
  // Below lg the full panel only shows when opened from the strip, or when
  // there are no channels yet (then it holds the Add Channel button and the
  // hint for a new account).
  const panelBelowLg = channelsOpen || !hasChannels;
  const menuIntegrations = useMemo(() => {
    return orderBy(
      Object.values(
        groupBy(sortedIntegrations, (o) => o?.customer?.id || '')
      ).map((p) => ({
        name: (p[0].customer?.name || '') as string,
        id: (p[0].customer?.id || '') as string,
        isEmpty: p.length === 0,
        values: orderBy(
          p,
          ['type', 'disabled', 'identifier'],
          ['desc', 'asc', 'asc']
        ),
      })),
      ['isEmpty', 'name'],
      ['desc', 'asc']
    );
  }, [sortedIntegrations]);
  const update = useCallback(async (shouldReload: boolean) => {
    if (shouldReload) {
      setReload(true);
    }
    await mutate();
    if (shouldReload) {
      setReload(false);
    }
  }, []);
  const continueIntegration = useCallback(
    (integration: any) => async () => {
      router.push(
        `/launches?added=${integration.identifier}&continue=${integration.id}`
      );
    },
    []
  );
  const refreshChannel = useCallback(
    (
        integration: Integration & {
          identifier: string;
          isCustomFields?: boolean;
          customFields?: any[];
        }
      ) =>
      async () => {
        // Custom-fields providers (Bluesky, etc.) have no OAuth URL to redirect
        // to: reconnect by re-entering the credentials, like the menu does.
        if (integration.isCustomFields) {
          modal.openModal({
            title: t('custom_url', 'Custom URL'),
            withCloseButton: false,
            classNames: {
              modal: 'md',
            },
            children: (
              <CustomVariables
                identifier={integration.identifier}
                gotoUrl={(url: string) => router.push(url)}
                variables={integration.customFields || []}
              />
            ),
          });
          return;
        }

        const { url } = await (
          await fetch(
            `/integrations/social/${integration.identifier}?refresh=${integration.internalId}`,
            {
              method: 'GET',
            }
          )
        ).json();
        window.location.href = url;
      },
    []
  );
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    if (search.get('msg')) {
      toast.show(search.get('msg')!, 'success');
      window?.opener?.postMessage(
        {
          msg: search.get('msg')!,
          success: false,
        },
        '*'
      );
    }
    if (search.get('added')) {
      fireEvents('channel_added');
      window?.opener?.postMessage(
        {
          msg: t('channel_added', 'Channel added'),
          success: true,
        },
        '*'
      );
    }
    if (window.opener) {
      window.close();
    }
  }, []);
  if (isLoading || reload) {
    return (
      <div className="bg-newBgColorInner p-[20px] flex flex-1 flex-col gap-[15px] transition-all items-center justify-center">
        <LoadingComponent />
      </div>
    );
  }

  // @ts-ignore
  return (
    <DNDProvider>
      <Onboarding />
      <CalendarWeekProvider integrations={sortedIntegrations}>
        {/* One flex item for the layout's children row, so this page chooses its
            own breakpoint (lg) for putting the channel panel beside the
            calendar instead of the layout's md. */}
        <div className="flex flex-col lg:flex-row flex-1 gap-[1px] min-w-0">
        {!isLg && hasChannels && !channelsOpen && (
          <ChannelStrip
            integrations={sortedIntegrations}
            onOpen={() => setChannelsOpen(true)}
            update={() => update(true)}
            refreshChannel={refreshChannel}
            continueIntegration={continueIntegration}
          />
        )}
        <div
          className={clsx(
            'relative flex-col shrink-0 w-full lg:flex lg:h-auto',
            // Below lg the open panel sits above the calendar. The height has to
            // be explicit, not a max-height: this panel's only child is
            // absolutely positioned, so in a column flex the wrapper collapses
            // to zero and the absolute child paints over the calendar toolbar.
            // In a row (lg+) it stretches and needs nothing.
            panelBelowLg
              ? clsx('flex', hasChannels ? 'h-[min(320px,55vh)]' : 'h-[210px]')
              : 'hidden',
            sidebarMode ? 'group sidebar lg:w-[100px]' : 'lg:w-[260px]'
          )}
        >
          <div
            className={clsx(
              'bg-newBgColorInner p-[20px] flex flex-col gap-[15px] transition-all absolute start-0 top-0 w-full h-full overflow-x-hidden overflow-y-auto scrollbar scrollbar-thumb-fifth scrollbar-track-newBgColor'
            )}
          >
            <div className="flex items-center">
              <h2 className="group-[.sidebar]:hidden flex-1 text-[20px] font-[500]">
                {t('channels')}
              </h2>
              <div
                onClick={() =>
                  isLg
                    ? setCollapseMenu(collapseMenu === '1' ? '0' : '1')
                    : setChannelsOpen(false)
                }
                className={clsx(
                  'group-[.sidebar]:rotate-[180deg] group-[.sidebar]:mx-auto text-btnText bg-btnSimple rounded-[6px] flex items-center justify-center cursor-pointer select-none',
                  // lg and up: the 24px sidebar toggle. Below lg: a 36px button
                  // pointing up that folds the panel back into the strip.
                  isLg ? 'w-[24px] h-[24px]' : 'w-[36px] h-[36px] rotate-90',
                  // Nothing to collapse to until the first channel is connected.
                  !isLg && !hasChannels && 'hidden'
                )}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="7"
                  height="13"
                  viewBox="0 0 7 13"
                  fill="none"
                >
                  <path
                    d="M6 11.5L1 6.5L6 1.5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </div>
            <div className="flex flex-col gap-[8px] group-[.sidebar]:mx-auto group-[.sidebar]:w-[44px]">
              <AddProviderButton update={() => update(true)} />
              <div className="flex gap-[8px] group-[.sidebar]:flex-col">
                {sortedIntegrations?.length > 0 && <NewPost />}
                {sortedIntegrations?.length > 0 &&
                  user?.tier?.ai &&
                  billingEnabled && <GeneratorComponent />}
              </div>
            </div>
            <div className="gap-[32px] flex flex-col select-none flex-1">
              {sortedIntegrations.length === 0 && !sidebarMode && (
                <div className="flex-1 max-h-[500px] justify-center items-center flex">
                  <div className="flex flex-col gap-[12px] text-center">
                    {/* Was an illustration of Reddit and Instagram - one we
                        don't support and one waiting on Meta review - on the
                        screen every new user sees first. Show channels a new
                        account can actually connect today. */}
                    <div className="mx-auto flex items-center gap-[10px]">
                      {['x', 'linkedin', 'youtube', 'facebook'].map((id) => (
                        <img
                          key={id}
                          src={
                            id === 'youtube'
                              ? '/icons/platforms/youtube.svg'
                              : `/icons/platforms/${id}.png`
                          }
                          alt={id}
                          className="w-[36px] h-[36px] rounded-full"
                        />
                      ))}
                    </div>
                    <div className="font-[600] text-[20px]">
                      {t('no_channels', 'No channels yet')}
                    </div>
                    <div className="text-[14px]">
                      {t('connect_your_accounts')}
                    </div>
                    <div className="text-[13px] opacity-70">
                      {t(
                        'first_channel_hint',
                        'Start with X, LinkedIn, YouTube or a Facebook Page - click Add Channel above.'
                      )}
                    </div>
                  </div>
                </div>
              )}
              {menuIntegrations.map((menu) => (
                <MenuGroupComponent
                  collapsed={sidebarMode}
                  changeItemGroup={changeItemGroup}
                  key={menu.name}
                  group={menu}
                  mutate={mutate}
                  continueIntegration={continueIntegration}
                  update={update}
                  refreshChannel={refreshChannel}
                  totalNonDisabledChannels={totalNonDisabledChannels}
                />
              ))}
            </div>
            <div className="mt-[5px] text-center flex flex-col">
              {billingEnabled && user?.isLifetime && (
                <div>{capitalize(user?.tier?.current || '')} tier</div>
              )}
              <div>
                {process.env.NEXT_PUBLIC_VERSION
                  ? process.env.NEXT_PUBLIC_VERSION
                  : ''}
              </div>
            </div>
          </div>
        </div>
        <div className="bg-newBgColorInner flex-1 flex-col flex min-w-0 p-[12px] md:p-[20px] gap-[12px]">
          <Filters />
          {/* The grid is absolutely positioned inside this box, so on a short
              window it would otherwise collapse to nothing under the toolbar. */}
          <div className="flex-1 flex min-h-[240px] lg:min-h-0">
            <Calendar />
          </div>
        </div>
        </div>
      </CalendarWeekProvider>
    </DNDProvider>
  );
};
