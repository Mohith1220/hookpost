import 'reflect-metadata';
import { InstagramProvider } from '@hookpost/nestjs-libraries/integrations/social/instagram.provider';

// Records the container requests postPending would send to Meta; nothing leaves the process.
const run = async (settings: any, media: any[]) => {
  const provider: any = new InstagramProvider();
  const urls: string[] = [];
  provider.fetch = async (url: string) => {
    urls.push(url);
    return { json: async () => ({ id: `c${urls.length}` }) };
  };
  const [res] = await provider.postPending(
    'IGID',
    'TOKEN',
    [{ id: 'p1', message: 'hi', settings, media }],
    {} as any,
    'graph.instagram.com'
  );
  return { urls, pending: res.pendingData };
};

describe('Instagram is_ai_generated', () => {
  it('adds the flag to a reel container when the post opts in', async () => {
    const { urls } = await run({ post_type: 'post', is_ai_generated: true }, [
      { path: 'https://x/a.mp4', thumbnailTimestamp: 1600 },
    ]);
    expect(urls[0]).toContain('media_type=REELS');
    expect(urls[0]).toContain('&is_ai_generated=true');
  });

  it('leaves posts that do not opt in unchanged', async () => {
    const { urls } = await run({ post_type: 'post' }, [{ path: 'https://x/a.mp4' }]);
    expect(urls[0]).not.toContain('is_ai_generated');
  });

  it('never sends it on carousel children, and carries it to the parent', async () => {
    const { urls, pending } = await run(
      { post_type: 'post', is_ai_generated: 'true' },
      [{ path: 'https://x/a.jpg' }, { path: 'https://x/b.jpg' }]
    );
    urls.forEach((u) => expect(u).not.toContain('is_ai_generated'));
    expect(pending.isAiGenerated).toBe(true);
  });

  it('never sends it on stories', async () => {
    const { urls, pending } = await run({ post_type: 'story', is_ai_generated: true }, [
      { path: 'https://x/a.mp4' },
    ]);
    expect(urls[0]).not.toContain('is_ai_generated');
    expect(pending.isAiGenerated).toBe(false);
  });
});
