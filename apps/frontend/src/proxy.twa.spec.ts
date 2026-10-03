/**
 * @jest-environment node
 *
 * The signed-in redirect from / to /launches must not drop the Google Play
 * app's launch signal, and must not change for anyone else.
 *   pnpm exec jest -c apps/frontend/jest.config.ts
 */
import { NextRequest } from 'next/server';
import { proxy } from '@hookpost/frontend/proxy';

const signedInHome = (headers: Record<string, string> = {}, path = '/') =>
  proxy(
    new NextRequest(`https://hookpost.hookstep.in${path}`, {
      headers: { cookie: 'auth=session', ...headers },
    })
  );

describe('proxy: / for a signed-in visitor', () => {
  it('carries the Play app launch over as ?source=twa', async () => {
    const res = await signedInHome({
      referer: 'android-app://in.hookstep.hookpost.twa/',
    });
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe(
      'https://hookpost.hookstep.in/launches?source=twa'
    );
  });

  it('keeps an existing query string', async () => {
    const res = await signedInHome(
      { referer: 'android-app://in.hookstep.hookpost.twa/' },
      '/?utm_source=x'
    );
    expect(res.headers.get('location')).toBe(
      'https://hookpost.hookstep.in/launches?utm_source=x&source=twa'
    );
  });

  it('is unchanged for a normal browser', async () => {
    const res = await signedInHome({ referer: 'https://www.google.com/' });
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe(
      'https://hookpost.hookstep.in/launches'
    );
  });

  it('does not treat a sibling package as the Play app', async () => {
    const res = await signedInHome({
      referer: 'android-app://in.hookstep.hookpost.twa2/',
    });
    expect(res.headers.get('location')).toBe(
      'https://hookpost.hookstep.in/launches'
    );
  });

  it('still serves the homepage to anonymous visitors, TWA or not', async () => {
    const res = await proxy(
      new NextRequest('https://hookpost.hookstep.in/', {
        headers: { referer: 'android-app://in.hookstep.hookpost.twa/' },
      })
    );
    expect(res.headers.get('location')).toBeNull();
  });
});
