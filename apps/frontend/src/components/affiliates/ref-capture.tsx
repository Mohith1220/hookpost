'use client';

import { useEffect } from 'react';

/** Cookie window for an affiliate link, matching the /affiliates terms page. */
const REF_DAYS = 60;

/**
 * Remembers the affiliate code from a `?ref=CODE` link in the `hp_ref`
 * cookie. Done in the browser rather than in proxy.ts because marketing pages
 * are served from the Cloudflare/NGINX cache, where middleware never runs.
 * The backend reads the cookie on GET /user/self once the visitor has a
 * workspace. Last click wins, as with most affiliate programmes.
 */
export function RefCapture(): null {
  useEffect(() => {
    try {
      const ref = new URLSearchParams(window.location.search)
        .get('ref')
        ?.trim()
        .toLowerCase();
      if (!ref || !/^[a-z0-9-]{3,40}$/.test(ref)) return;
      const secure = window.location.protocol === 'https:' ? '; Secure' : '';
      document.cookie = `hp_ref=${ref}; Max-Age=${
        REF_DAYS * 86400
      }; Path=/; SameSite=Lax${secure}`;
    } catch {
      // Never block the page over attribution.
    }
  }, []);
  return null;
}
