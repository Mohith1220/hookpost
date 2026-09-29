'use client';

/**
 * Resolves once the visitor first interacts with the page (pointerdown,
 * keydown, scroll, touchstart) or after ~4s, whichever comes first. One shared
 * trigger for every third-party script on the marketing pages, so they all
 * load together on the same user gesture.
 *
 * Why: next/script's lazyOnload only waits for window.load plus an idle
 * callback, which on a fast static page is still inside the Lighthouse trace.
 * GTM + gtag (~427KB, ~258ms of blocking) and the Meta pixel took mobile
 * Performance on / from 100 to 76. Deferring them past the first gesture takes
 * them out of the load entirely. Events fired before the scripts arrive are
 * not lost: the fbq and gtag stubs are installed immediately and queue calls,
 * and the real libraries drain those queues when they load.
 *
 * Trade-off, accepted: a visitor who leaves within ~4s without touching,
 * scrolling or pressing a key is not seen by the browser pixel. The
 * server-side ViewContent (POST /public/t, Conversions API) still records them.
 */
const EVENTS = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const;
const IDLE_MS = 4000;

let engaged: Promise<void> | null = null;

export function whenEngaged(): Promise<void> {
  if (engaged) return engaged;
  engaged = new Promise<void>((resolve) => {
    if (typeof window === 'undefined') return;
    const w = window as any;
    let done = false;
    let timer = 0;
    const fire = () => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      EVENTS.forEach((e) => window.removeEventListener(e, fire, true));
      resolve();
    };
    EVENTS.forEach((e) =>
      window.addEventListener(e, fire, { capture: true, passive: true, once: true })
    );
    // After the timeout, still wait for a quiet main thread so the scripts
    // never land on top of hydration or a long task.
    timer = window.setTimeout(() => {
      if (w.requestIdleCallback) w.requestIdleCallback(fire, { timeout: 2000 });
      else fire();
    }, IDLE_MS);
  });
  return engaged;
}

/** Appends an async <script> once (by id). */
export function injectScript(id: string, src: string, onLoad?: () => void): void {
  const existing = document.getElementById(id) as HTMLScriptElement | null;
  if (existing) {
    if (onLoad) existing.addEventListener('load', onLoad, { once: true });
    return;
  }
  const s = document.createElement('script');
  s.id = id;
  s.src = src;
  s.async = true;
  if (onLoad) s.addEventListener('load', onLoad, { once: true });
  document.head.appendChild(s);
}
