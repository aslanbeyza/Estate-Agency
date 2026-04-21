import { parseAllowedOrigins } from './main';

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
