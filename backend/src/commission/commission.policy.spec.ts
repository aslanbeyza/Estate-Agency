import { ConfigService } from '@nestjs/config';
import { CommissionPolicyService } from './commission.policy';

/**
 * CommissionPolicyService is tiny but security-critical: a misconfigured env
 * var would quietly change how every transaction pays out. The tests cover
 * the three non-trivial branches — defaults, valid overrides, invalid
 * overrides — and ensure the service returns an immutable copy.
 */
describe('CommissionPolicyService', () => {
  function makeConfig(env: Record<string, string | undefined>): ConfigService {
    return {
      get: (key: string) => env[key],
    } as unknown as ConfigService;
  }

  it('uses the documented defaults when no env vars are set', () => {
    const svc = new CommissionPolicyService(makeConfig({}));
    expect(svc.current()).toEqual({
      agencyBps: 5_000,
      listingAgentBps: 5_000,
    });
  });

  it('honours overrides that fall inside [0, 10_000]', () => {
    const svc = new CommissionPolicyService(
      makeConfig({
        COMMISSION_AGENCY_BPS: '6000',
        COMMISSION_LISTING_AGENT_BPS: '7000',
      }),
    );
    expect(svc.current()).toEqual({
      agencyBps: 6_000,
      listingAgentBps: 7_000,
    });
  });

  it('treats the boundary values 0 and 10_000 as valid', () => {
    const svc = new CommissionPolicyService(
      makeConfig({
        COMMISSION_AGENCY_BPS: '10000',
        COMMISSION_LISTING_AGENT_BPS: '0',
      }),
    );
    expect(svc.current()).toEqual({
      agencyBps: 10_000,
      listingAgentBps: 0,
    });
  });

  it('throws loud on a negative override — we never silently revert to default', () => {
    expect(
      () =>
        new CommissionPolicyService(
          makeConfig({ COMMISSION_AGENCY_BPS: '-1' }),
        ),
    ).toThrow(/COMMISSION_AGENCY_BPS/);
  });

  it('throws loud on an override above 10_000', () => {
    expect(
      () =>
        new CommissionPolicyService(
          makeConfig({ COMMISSION_LISTING_AGENT_BPS: '10001' }),
        ),
    ).toThrow(/COMMISSION_LISTING_AGENT_BPS/);
  });

  it('throws loud on a non-integer override (no silent truncation)', () => {
    expect(
      () =>
        new CommissionPolicyService(
          makeConfig({ COMMISSION_AGENCY_BPS: '50.5' }),
        ),
    ).toThrow(/COMMISSION_AGENCY_BPS/);
  });

  it('throws loud on a non-numeric override', () => {
    expect(
      () =>
        new CommissionPolicyService(
          makeConfig({ COMMISSION_AGENCY_BPS: 'half' }),
        ),
    ).toThrow(/COMMISSION_AGENCY_BPS/);
  });

  it('returns an immutable copy — callers cannot mutate the singleton', () => {
    const svc = new CommissionPolicyService(makeConfig({}));
    const a = svc.current();
    a.agencyBps = 0;
    expect(svc.current().agencyBps).toBe(5_000);
  });
});
