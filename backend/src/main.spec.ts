import {
  isCorsOriginAllowed,
  parseAllowedOrigins,
  vercelHostsShareSameProject,
} from './main';

/**
 * The bootstrap function is hard to unit-test (it spins up a real Nest
 * app), but origin parsing is the security-critical part and it's pure.
 * Isolating it lets us lock down the policy with a tight, fast test.
 */
describe('parseAllowedOrigins', () => {
  it('falls back to the local Nuxt dev server when unset', () => {
    expect(parseAllowedOrigins(undefined)).toEqual(['http://localhost:3000']);
    expect(parseAllowedOrigins('')).toEqual(['http://localhost:3000']);
    expect(parseAllowedOrigins('   ')).toEqual(['http://localhost:3000']);
  });

  it('splits on commas and trims whitespace', () => {
    expect(
      parseAllowedOrigins(' http://localhost:3000 , https://app.example.com '),
    ).toEqual(['http://localhost:3000', 'https://app.example.com']);
  });

  it('drops empty entries so a trailing comma does not become ""', () => {
    expect(parseAllowedOrigins('http://localhost:3000,,')).toEqual([
      'http://localhost:3000',
    ]);
  });

  it('refuses the "*" wildcard — financial APIs must be origin-locked', () => {
    expect(() => parseAllowedOrigins('*')).toThrow(/FRONTEND_ORIGIN/);
    expect(() => parseAllowedOrigins('http://localhost:3000,*')).toThrow(
      /FRONTEND_ORIGIN/,
    );
  });
});

describe('vercelHostsShareSameProject', () => {
  const prod = 'estate-agency-ay4u.vercel.app';

  it('matches exact host', () => {
    expect(vercelHostsShareSameProject(prod, prod)).toBe(true);
  });

  it('matches classic -git- preview hostnames', () => {
    expect(
      vercelHostsShareSameProject(
        'estate-agency-ay4u-git-main-beyzaaslans-projects.vercel.app',
        prod,
      ),
    ).toBe(true);
  });

  it('matches hash-style Vercel deployment preview hostnames', () => {
    expect(
      vercelHostsShareSameProject(
        'estate-agency-banhwly0t-beyzaaslans-projects.vercel.app',
        prod,
      ),
    ).toBe(true);
  });

  it('rejects same segment count impersonation', () => {
    expect(
      vercelHostsShareSameProject('estate-agency-evil.vercel.app', prod),
    ).toBe(false);
  });

  it('rejects unrelated Vercel projects', () => {
    expect(
      vercelHostsShareSameProject('evil-copy-git-main-x.vercel.app', prod),
    ).toBe(false);
  });
});

describe('isCorsOriginAllowed', () => {
  const list = ['https://estate-agency-ay4u.vercel.app'];

  it('allows exact allow-list match', () => {
    expect(
      isCorsOriginAllowed('https://estate-agency-ay4u.vercel.app', list),
    ).toBe(true);
  });

  it('allows -git- preview when production URL is on the allow-list', () => {
    expect(
      isCorsOriginAllowed(
        'https://estate-agency-ay4u-git-main-beyzaaslans-projects.vercel.app',
        list,
      ),
    ).toBe(true);
  });

  it('allows hash-style preview URLs (no -git- in hostname)', () => {
    expect(
      isCorsOriginAllowed(
        'https://estate-agency-banhwly0t-beyzaaslans-projects.vercel.app',
        list,
      ),
    ).toBe(true);
  });

  it('rejects other Vercel projects', () => {
    expect(
      isCorsOriginAllowed('https://evil-copy-git-main-x.vercel.app', list),
    ).toBe(false);
  });

  it('allows missing Origin (non-browser clients)', () => {
    expect(isCorsOriginAllowed(undefined, list)).toBe(true);
  });
});
