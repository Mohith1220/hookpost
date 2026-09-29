'use client';

import Script from 'next/script';
import { FC, useEffect } from 'react';
import { useUser } from '@hookpost/frontend/components/layout/user.context';
import { useVariables } from '@hookpost/react/helpers/variable.context';
import { injectScript, whenEngaged } from './when-engaged';

export const TrialTracker: FC = () => {
  const user = useUser();
  const { googleAdsId, googleAdsTrialTracking } = useVariables();
  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      !user?.id ||
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-expect-error
      !window.gtag ||
      !googleAdsId ||
      !googleAdsTrialTracking
    )
      return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('trialStart') !== 'true') return;
    const key = `gtm_start_trial_${user?.id}`;
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, '1');
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error
    gtag('event', 'conversion', {
      send_to: `${googleAdsId}/${googleAdsTrialTracking}`,
      transaction_id: user.id,
    });
  }, [user]);
  return null;
};

export const GoogleTagManagerComponent: FC<{
  gtmId?: string;
  googleAdsId?: string;
  // Marketing pages: queue on dataLayer now, fetch gtm.js / gtag.js only after
  // the first interaction or ~4s (see when-engaged.ts). Off = today's
  // lazyOnload behaviour, which the logged-in app keeps.
  deferUntilEngaged?: boolean;
}> = ({ gtmId, googleAdsId, deferUntilEngaged = false }) => {
  // Two different Google products share this one env var, and they are not
  // interchangeable. A GTM container ("GTM-...") is loaded by gtm.js and reads
  // dataLayer; gtag.js takes a Google Ads ("AW-...") or GA4 ("G-...") id and
  // rejects a container id. Passing a container to gtag('config') silently
  // measures nothing, which is what this component used to do.
  // A container and a Google Ads id are not alternatives - a live container
  // with no tags inside it measures nothing, which is the state this account
  // is in ("Container quality: No recent data", and Google Ads reports the tag
  // as URGENT / not detected). So render both when both are configured: the
  // container for anything configured in the GTM UI, and gtag for Google Ads.
  // Every script below is lazyOnload, not afterInteractive. Measured on the
  // live site with Lighthouse mobile the day tracking actually started
  // working: GTM cost 163ms of blocking time and 266KB, gtag another 242ms of
  // script evaluation, and together they took mobile Performance from 100 to
  // 90 with TBT at 320ms. Nothing here has to run before the page is
  // interactive - Purchase is fired server-side from the Razorpay webhook,
  // CompleteRegistration fires on a user action minutes later, and PageView
  // still fires, just after load rather than ahead of it.
  const container = gtmId && gtmId.startsWith('GTM-') ? gtmId : undefined;
  // If NEXT_PUBLIC_GTM_ID itself holds an AW-/G- id, that is the gtag id.
  const tagId = googleAdsId || (!container ? gtmId : undefined);

  useEffect(() => {
    if (!deferUntilEngaged || (!container && !tagId)) {
      return;
    }
    const w = window as any;
    w.dataLayer = w.dataLayer || [];
    if (tagId) {
      // The standard gtag stub. It must push the `arguments` object itself,
      // not an array - gtag.js only treats Arguments entries as commands.
      if (!w.gtag) {
        w.gtag = function () {
          // eslint-disable-next-line prefer-rest-params
          w.dataLayer.push(arguments);
        };
      }
      w.gtag('js', new Date());
      w.gtag('config', tagId);
    }
    whenEngaged().then(() => {
      if (container) {
        w.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
        injectScript(
          'google-tag-manager',
          `https://www.googletagmanager.com/gtm.js?id=${container}`
        );
      }
      if (tagId) {
        injectScript(
          'google-ads-gtag-lib',
          `https://www.googletagmanager.com/gtag/js?id=${tagId}`
        );
      }
    });
  }, [deferUntilEngaged, container, tagId]);

  if ((!gtmId && !googleAdsId) || deferUntilEngaged) {
    return null;
  }

  return (
    <>
      {container ? (
        <Script id="google-tag-manager" strategy="lazyOnload">
          {`
    (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
    new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
    j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
    'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
    })(window,document,'script','dataLayer','${container}');
  `}
        </Script>
      ) : null}

      {!tagId ? null : (
      <>
      {/* This used to be <Script src="/g.js" />, but no such file exists in
          public/ and the live URL 404s, so gtag never loaded and every
          conversion was dropped. Load it from Google directly. */}
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${tagId}`}
        strategy="lazyOnload"
      />

      <Script id="google-ads-gtag" strategy="lazyOnload">
        {`
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', '${tagId}');
  `}
      </Script>
      </>
      )}
    </>
  );
};
