import { Injectable } from '@nestjs/common';

export type CommissionScenario = 'same_agent' | 'different_agents';

/**
 * All monetary amounts are stored and transferred as **integer kuruş**
 * (1 TRY = 100 kuruş). This eliminates IEEE-754 float drift entirely —
 * no rounding, no `Number.EPSILON`, no big-decimal library needed.
 *
 * Presentation-layer code is responsible for dividing by 100 when the
 * amount is shown to end users.
 */
export interface CommissionBreakdown {
  agencyAmount: number;
  listingAgentAmount: number;
  sellingAgentAmount: number;
  scenario: CommissionScenario;
}

@Injectable()
export class CommissionService {
  /**
   * Rules (see DESIGN.md §1.5):
   *   - Agency: 50% of total service fee
   *   - Agents share: the remaining 50%
   *     - Same agent (listing == selling): 100% of agents' share goes to that agent
   *     - Different agents: split 50/50 (25% each of total fee)
   *
   * Integer division policy:
   *   All inputs are integer kuruş. `Math.floor` on each split guarantees
   *   every piece is a whole kuruş, and the agency absorbs any residue so
   *   the sum invariant always holds:
   *
   *     agencyAmount + listingAgentAmount + sellingAgentAmount === totalServiceFee
   *
   * Residue can only be 0–3 kuruş (< 1 ₺ of a fraction), which matches
   * real-world accounting conventions (the house takes the rounding).
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

    const isSameAgent = listingAgentId === sellingAgentId;
    const agentsPool = Math.floor(totalServiceFee / 2);

    let listingAgentAmount: number;
    let sellingAgentAmount: number;

    if (isSameAgent) {
      listingAgentAmount = agentsPool;
      sellingAgentAmount = 0;
    } else {
      const half = Math.floor(agentsPool / 2);
      listingAgentAmount = half;
      sellingAgentAmount = half;
    }

    const agencyAmount =
      totalServiceFee - listingAgentAmount - sellingAgentAmount;

    return {
      agencyAmount,
      listingAgentAmount,
      sellingAgentAmount,
      scenario: isSameAgent ? 'same_agent' : 'different_agents',
    };
  }
}
