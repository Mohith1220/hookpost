import { cookies } from 'next/headers';
import { TWA_COOKIE } from '@hookpost/frontend/components/layout/twa';

/**
 * Server components' view of "is this the Google Play app?". Reads the cookie
 * the layout's bootstrap script sets on the Play app's first page load, so it
 * is false on that very first request and true from the next one on. Client
 * components use useIsTwa, which also covers that first request.
 */
export const isTwaServerSide = async (): Promise<boolean> =>
  (await cookies()).get(TWA_COOKIE)?.value === '1';
