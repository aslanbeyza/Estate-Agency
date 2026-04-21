import { Injectable } from '@nestjs/common';
import {
  BPS_DENOMINATOR,
  CommissionPolicy,
  CommissionPolicyService,
} from './commission.policy';

export type CommissionScenario = 'same_agent' | 'different_agents';

/**
 * All monetary amounts are stored and transferred as **integer kuruş**
 * (1 TRY = 100 kuruş). This eliminates IEEE-754 float drift entirely —
 * no rounding, no `Number.EPSILON`, no big-decimal library needed.
 *
 * Presentation-layer code is responsible for dividing by 100 when the
 * amount is shown to end users.
 *
 * The breakdown embeds the **policy snapshot** that produced it. Rates may
 * change over time, but a transaction's embedded numbers + snapshot are a
 * self-contained, immutable historical record — auditable forever without
 * needing to look up "what were the rates on 2026-03-14?".
 */
export interface CommissionBreakdown {
  agencyAmount: number;
  listingAgentAmount: number;
  sellingAgentAmount: number;
  scenario: CommissionScenario;
  policy: CommissionPolicy;
}

@Injectable()
export class CommissionService {
  constructor(private readonly policyService: CommissionPolicyService) {}

  /**
   * Rules (see DESIGN.md §1.5):
   *   - Agency: `agencyBps` bps of total service fee.
   *   - Agents share: the remaining pool (`10_000 − agencyBps` bps of total).
   *     - Same agent (listing == selling): 100 % of the pool goes to that agent.
   *     - Different agents: split per `listingAgentBps` / (10_000 − listingAgentBps)
   *       of the pool.
   *
   * Integer arithmetic policy:
   *   All inputs are integer kuruş. Every split uses `Math.floor(total * bps /
   *   10_000)`; the agency absorbs any residue so the sum invariant always
   *   holds:
   *
   *     agencyAmount + listingAgentAmount + sellingAgentAmount === totalServiceFee
   *
   *   With the default 50 / 25 / 25 split the residue is at most 3 kuruş —
   *   less than a fractional ₺ — which matches real-world accounting
   *   conventions (the house takes the rounding).
   */
  calculate(
    totalServiceFee: number,
    listingAgentId: string,
    sellingAgentId: string,
  ): CommissionBreakdown {
    if (!Number.isInteger(totalServiceFee)) {
      throw new Error('totalServiceFee must be an integer (kuruş)');
    }
    if (totalServiceFee < 0) {
      throw new Error('totalServiceFee must be non-negative');
    }

    const policy = this.policyService.current();
    const isSameAgent = listingAgentId === sellingAgentId;

    // Agent pool = everything the agency does not take. `floor` on the pool
    // itself (not on the agency share) preserves the existing invariant:
    // agency absorbs the rounding residue of both layers of the split.
    const agentsPoolBps = BPS_DENOMINATOR - policy.agencyBps;
    const agentsPool = Math.floor(
      (totalServiceFee * agentsPoolBps) / BPS_DENOMINATOR,
    );

    let listingAgentAmount: number;
    let sellingAgentAmount: number;

    if (isSameAgent) {
      listingAgentAmount = agentsPool;
      sellingAgentAmount = 0;
    } else {
      listingAgentAmount = Math.floor(
        (agentsPool * policy.listingAgentBps) / BPS_DENOMINATOR,
      );
      sellingAgentAmount = Math.floor(
        (agentsPool * (BPS_DENOMINATOR - policy.listingAgentBps)) /
          BPS_DENOMINATOR,
      );
    }

    const agencyAmount =
      totalServiceFee - listingAgentAmount - sellingAgentAmount;

    return {
      agencyAmount,
      listingAgentAmount,
      sellingAgentAmount,
      scenario: isSameAgent ? 'same_agent' : 'different_agents',
      policy,
    };
  }
}
