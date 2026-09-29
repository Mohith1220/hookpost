'use client';

import Script from 'next/script';
import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { injectScript, whenEngaged } from './when-engaged';

const PIXEL = process.env.NEXT_PUBLIC_FACEBOOK_PIXEL;

/**
 * deferUntilEngaged (marketing pages): install Meta's standard fbq stub right
 * away, so init + PageView and any later fbq() call (ViewContent, SPA
 * PageViews) queue on it, and load the library itself only after the first
 * interaction or ~4s. The library drains fbq.queue when it arrives, so nothing
 * fired in between is lost. Without the flag (logged-in app) it is the same
 * lazyOnload snippet as before.
 */
export const FacebookComponent = ({
  deferUntilEngaged = false,
}: {
  deferUntilEngaged?: boolean;
}) => {
  const pathname = usePathname();
  // The init snippet already fires the first PageView, so the very first run of
  // this effect must not fire a second one for the same page.
  const firstRun = useRef(true);

  useEffect(() => {
    if (!PIXEL) {
      return;
    }
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    // App Router navigations never reload the document, so without this a
    // visitor who lands on an ad page and then browses the rest of the site
    // counts as a single page view.
    if (typeof window !== 'undefined' && (window as any).fbq) {
      (window as any).fbq('track', 'PageView');
    }
  }, [pathname]);

  useEffect(() => {
    if (!PIXEL || !deferUntilEngaged) {
      return;
    }
    const w = window as any;
    if (!w.fbq) {
      // Meta's snippet minus the <script> tag: same stub, same queue.
      const n: any = function () {
        // eslint-disable-next-line prefer-rest-params
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
      };
      w.fbq = n;
      if (!w._fbq) w._fbq = n;
      n.push = n;
      n.loaded = true;
      n.version = '2.0';
      n.queue = [];
      w.fbq('init', PIXEL);
      w.fbq('track', 'PageView');
    }
    whenEngaged().then(() => injectScript('fb-pixel-lib', '/f.js'));
  }, [deferUntilEngaged]);

  if (!PIXEL || deferUntilEngaged) {
    return null;
  }

  return (
    // lazyOnload, not afterInteractive: /f.js is a 523KB library and nothing on
    // the page waits for it. afterInteractive had it competing with the page's
    // own chunks during load. It still fires PageView - just after the content.
    <Script strategy="lazyOnload" id="fb-pixel">
      {`!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'/f.js');
fbq('init', '${PIXEL}');
fbq('track', 'PageView');
`}
    </Script>
  );
};
