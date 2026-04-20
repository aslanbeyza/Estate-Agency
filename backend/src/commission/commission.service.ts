import { Injectable } from '@nestjs/common';

export type CommissionScenario = 'same_agent' | 'different_agents';

export interface CommissionBreakdown {
  agencyAmount: number;
  listingAgentAmount: number;
  sellingAgentAmount: number;
  scenario: CommissionScenario;
}

/**
 * Rounds to 2 decimals (cent precision) using banker-safe rounding.
 * Avoids JS float drift such as (0.1 + 0.2 !== 0.3).
 */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

@Injectable()
export class CommissionService {
  /**
   * Rules (see DESIGN.md §4.3):
   *   - Agency: 50% of total service fee
   *   - Agents share: 50%
   *     - Same agent (listing == selling): 100% of agents share to that agent
   *     - Different agents: split 50/50 (25% each of total fee)
   *
   * Sum invariant: agencyAmount + listingAgentAmount + sellingAgentAmount === totalServiceFee
   * Residue from rounding is added back to agency portion to preserve the invariant.
   */
  calculate(
    totalServiceFee: number,
    listingAgentId: string,
    sellingAgentId: string,
  ): CommissionBreakdown {
    if (totalServiceFee < 0) {
      throw new Error('totalServiceFee must be non-negative');
    }

    const isSameAgent = listingAgentId === sellingAgentId;
    const agentsPool = totalServiceFee * 0.5;

    let listingAgentAmount: number;
    let sellingAgentAmount: number;

    if (isSameAgent) {
      listingAgentAmount = round2(agentsPool);
      sellingAgentAmount = 0;
    } else {
      listingAgentAmount = round2(agentsPool / 2);
      sellingAgentAmount = round2(agentsPool / 2);
    }

    // Preserve sum invariant: agency absorbs the rounding residue.
    const agencyAmount = round2(
      totalServiceFee - listingAgentAmount - sellingAgentAmount,
    );

    return {
      agencyAmount,
      listingAgentAmount,
      sellingAgentAmount,
      scenario: isSameAgent ? 'same_agent' : 'different_agents',
    };
  }
}
