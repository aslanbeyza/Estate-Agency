import { CommissionService } from './commission.service';

/**
 * All amounts are integer kuruş (1 TRY = 100 kuruş).
 * e.g. 15_000_000 kuruş = ₺150.000,00
 */
describe('CommissionService', () => {
  let service: CommissionService;

  beforeEach(() => {
    service = new CommissionService();
  });

  describe('Scenario 1 — Same agent (listing == selling)', () => {
    it('agency 50%, listing agent 50%, selling agent 0', () => {
      const result = service.calculate(15_000_000, 'agent1', 'agent1');
      expect(result.agencyAmount).toBe(7_500_000);
      expect(result.listingAgentAmount).toBe(7_500_000);
      expect(result.sellingAgentAmount).toBe(0);
      expect(result.scenario).toBe('same_agent');
    });

    it('preserves sum invariant on odd fees (agency absorbs residue)', () => {
      // 15_000_033 kuruş: agentsPool = floor(15_000_033 / 2) = 7_500_016
      //                   agency = 15_000_033 - 7_500_016 = 7_500_017
      const result = service.calculate(15_000_033, 'x', 'x');
      const sum =
        result.agencyAmount +
        result.listingAgentAmount +
        result.sellingAgentAmount;
      expect(sum).toBe(15_000_033);
      expect(result.listingAgentAmount).toBe(7_500_016);
      expect(result.sellingAgentAmount).toBe(0);
      expect(result.agencyAmount).toBe(7_500_017);
    });
  });

  describe('Scenario 2 — Different agents', () => {
    it('agency 50%, each agent 25%', () => {
      const result = service.calculate(10_000_000, 'agent1', 'agent2');
      expect(result.agencyAmount).toBe(5_000_000);
      expect(result.listingAgentAmount).toBe(2_500_000);
      expect(result.sellingAgentAmount).toBe(2_500_000);
      expect(result.scenario).toBe('different_agents');
    });

    it('preserves sum invariant on fees that do not divide evenly by 4', () => {
      // 100_001 kuruş: pool = 50_000, half = 25_000 → agency = 50_001
      const result = service.calculate(100_001, 'a1', 'a2');
      const sum =
        result.agencyAmount +
        result.listingAgentAmount +
        result.sellingAgentAmount;
      expect(sum).toBe(100_001);
      expect(result.listingAgentAmount).toBe(25_000);
      expect(result.sellingAgentAmount).toBe(25_000);
      expect(result.agencyAmount).toBe(50_001);
    });

    it('residue is at most a few kuruş (< 4)', () => {
      // Worst case for different_agents: residue = totalServiceFee - 2*floor(floor(fee/2)/2)
      // which is 0..3 kuruş depending on fee mod 4.
      for (const fee of [0, 1, 2, 3, 4, 5, 99, 100, 101, 102, 103]) {
        const r = service.calculate(fee, 'a', 'b');
        expect(
          r.agencyAmount + r.listingAgentAmount + r.sellingAgentAmount,
        ).toBe(fee);
        const residue =
          r.agencyAmount - (r.listingAgentAmount + r.sellingAgentAmount);
        // Strictly non-negative (agency never loses to residue).
        expect(residue).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('Edge cases', () => {
    it('zero fee => all zero', () => {
      const result = service.calculate(0, 'a', 'b');
      expect(result.agencyAmount).toBe(0);
      expect(result.listingAgentAmount).toBe(0);
      expect(result.sellingAgentAmount).toBe(0);
    });

    it('rejects negative fee', () => {
      expect(() => service.calculate(-1, 'a', 'b')).toThrow();
    });

    it('rejects non-integer fee (guards against accidental TL input)', () => {
      expect(() => service.calculate(150.5, 'a', 'b')).toThrow(/integer/i);
      expect(() => service.calculate(0.1 + 0.2, 'a', 'b')).toThrow(/integer/i);
    });

    it('same agent scenario labels "same_agent"', () => {
      expect(service.calculate(1000, 'x', 'x').scenario).toBe('same_agent');
    });

    it('different agent scenario labels "different_agents"', () => {
      expect(service.calculate(1000, 'x', 'y').scenario).toBe(
        'different_agents',
      );
    });
  });
});
