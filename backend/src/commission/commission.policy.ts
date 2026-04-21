import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Commission policy expressed in **basis points** (1 bps = 0.01%,
 * 10_000 bps = 100%). Using integer bps instead of decimal percentages lets
 * us store, transmit and compare rates without any floating-point drift —
 * same reason we keep monetary amounts in kuruş.
 *
 * `agencyBps` is the agency's cut of the *total* service fee. The rest is
 * the agent pool. `listingAgentBps` is the listing agent's cut of that
 * pool (the selling agent gets the remainder). In the same-agent scenario
 * the listing agent receives the entire pool regardless of this value.
 */
export interface CommissionPolicy {
  agencyBps: number;
  listingAgentBps: number;
}

export const DEFAULT_COMMISSION_POLICY: CommissionPolicy = {
  agencyBps: 5_000, // 50 %
  listingAgentBps: 5_000, // 50 % of the agent pool (= 25 % of total for different-agent scenario)
};

export const BPS_DENOMINATOR = 10_000;

function parseBps(
  raw: string | undefined,
  fallback: number,
  logger: Logger,
  envName: string,
): number {
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > BPS_DENOMINATOR) {
    // Misconfigured env should fail loud, not silently revert. The app is
    // financial software — a wrong split is worse than a startup crash.
    throw new Error(
      `${envName} must be an integer between 0 and ${BPS_DENOMINATOR} (basis points). Got: ${raw}`,
    );
  }
  logger.log(`Commission policy override: ${envName}=${parsed} bps`);
  return parsed;
}

/**
 * Reads the active commission policy from the environment at startup.
 *
 * Why a service (and not a `const`):
 *   - The rates are runtime configuration, not a compile-time invariant.
 *   - Tomorrow's admin UI can switch this to a DB-backed loader without
 *     changing any caller — `CommissionService` depends on the interface,
 *     not on the source.
 *   - Each calculation takes a **snapshot** of the policy it used (see
 *     `CommissionService`); historical transactions stay self-documenting
 *     even if the rates change later.
 */
@Injectable()
export class CommissionPolicyService {
  private readonly logger = new Logger(CommissionPolicyService.name);
  private readonly policy: CommissionPolicy;

  constructor(config: ConfigService) {
    this.policy = {
      agencyBps: parseBps(
        config.get<string>('COMMISSION_AGENCY_BPS'),
        DEFAULT_COMMISSION_POLICY.agencyBps,
        this.logger,
        'COMMISSION_AGENCY_BPS',
      ),
      listingAgentBps: parseBps(
        config.get<string>('COMMISSION_LISTING_AGENT_BPS'),
        DEFAULT_COMMISSION_POLICY.listingAgentBps,
        this.logger,
        'COMMISSION_LISTING_AGENT_BPS',
      ),
    };
  }

  /** Returns a copy so callers can't mutate the singleton policy. */
  current(): CommissionPolicy {
    return { ...this.policy };
  }
}
