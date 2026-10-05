import {
  extractProviderMessage,
  stripQuery,
  truncateForTemporal,
} from '@hookpost/nestjs-libraries/integrations/social.abstract';

describe('stripQuery', () => {
  it('removes query parameters from valid URLs', () => {
    expect(stripQuery('https://a.com/b.png?x=1')).toBe('https://a.com/b.png');
  });

  it('falls back to splitting on ? for non-URL strings', () => {
    expect(stripQuery('not a url?x=1')).toBe('not a url');
  });
});

describe('truncateForTemporal', () => {
  it('returns an empty string for null', () => {
    expect(truncateForTemporal(null, 100)).toBe('');
  });

  it('returns an empty string for undefined', () => {
    expect(truncateForTemporal(undefined, 100)).toBe('');
  });

  it('returns strings unchanged when within the limit', () => {
    expect(truncateForTemporal('abc', 3)).toBe('abc');
    expect(truncateForTemporal('ab', 3)).toBe('ab');
  });

  it('truncates strings with the expected suffix', () => {
    expect(truncateForTemporal('abcdef', 3)).toBe('abc… [truncated 3 chars]');
  });

  it('JSON-stringifies objects', () => {
    expect(truncateForTemporal({ foo: 'bar' }, 1000)).toBe(
      JSON.stringify({ foo: 'bar' })
    );
  });

  it('does not throw for circular objects', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => truncateForTemporal(circular, 1000)).not.toThrow();
  });
});

describe('extractProviderMessage', () => {
  it('extracts Graph API error messages', () => {
    const raw = JSON.stringify({
      error: { message: 'Bad token', code: 190, error_subcode: 460 },
    });
    expect(extractProviderMessage(raw)).toBe('Bad token (code 190/460)');
  });

  it('extracts detail messages', () => {
    const raw = JSON.stringify({ detail: 'Too many' });
    expect(extractProviderMessage(raw)).toBe('Too many');
  });

  it('returns undefined for null', () => {
    expect(extractProviderMessage(null)).toBeUndefined();
  });

  it('returns undefined for plain non-JSON strings', () => {
    expect(extractProviderMessage('plain')).toBeUndefined();
  });

  it('limits messages to 300 characters', () => {
    const longMessage = 'a'.repeat(301);
    const raw = JSON.stringify({ detail: longMessage });
    const result = extractProviderMessage(raw);
    expect(result).toBeDefined();
    expect(result!.length).toBe(300);
  });
});
