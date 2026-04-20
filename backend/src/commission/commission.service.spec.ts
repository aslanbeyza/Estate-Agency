import { CommissionService } from './commission.service';

describe('CommissionService', () => {
  let service: CommissionService;

  beforeEach(() => {
    service = new CommissionService();
  });

  describe('Scenario 1 — Same agent (listing == selling)', () => {
    it('agency %50, listing agent %50, selling agent 0', () => {
      const result = service.calculate(100_000, 'agent1', 'agent1');
      expect(result.agencyAmount).toBe(50_000);
      expect(result.listingAgentAmount).toBe(50_000);
      expect(result.sellingAgentAmount).toBe(0);
      expect(result.scenario).toBe('same_agent');
    });

    it('preserves sum invariant on odd fees', () => {
      const fee = 75_000.33;
      const result = service.calculate(fee, 'x', 'x');
      const sum =
        result.agencyAmount + result.listingAgentAmount + result.sellingAgentAmount;
      expect(sum).toBeCloseTo(fee, 2);
      expect(result.scenario).toBe('same_agent');
    });
  });

  describe('Scenario 2 — Different agents', () => {
    it('agency %50, each agent %25', () => {
      const result = service.calculate(100_000, 'agent1', 'agent2');
      expect(result.agencyAmount).toBe(50_000);
      expect(result.listingAgentAmount).toBe(25_000);
      expect(result.sellingAgentAmount).toBe(25_000);
      expect(result.scenario).toBe('different_agents');
    });

    it('preserves sum invariant on fees that do not divide evenly by 4', () => {
      const fee = 100_001;
      const result = service.calculate(fee, 'a1', 'a2');
      const sum =
        result.agencyAmount + result.listingAgentAmount + result.sellingAgentAmount;
      expect(sum).toBeCloseTo(fee, 2);
    });

    it('handles fractional fees (JS float drift)', () => {
      const fee = 0.1 + 0.2; // 0.30000000000000004
      const result = service.calculate(fee, 'a1', 'a2');
      const sum =
        result.agencyAmount + result.listingAgentAmount + result.sellingAgentAmount;
      expect(Math.abs(sum - fee)).toBeLessThan(0.01);
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

    it('same agent scenario labels "same_agent"', () => {
      expect(service.calculate(10, 'x', 'x').scenario).toBe('same_agent');
    });

    it('different agent scenario labels "different_agents"', () => {
      expect(service.calculate(10, 'x', 'y').scenario).toBe('different_agents');
    });
  });
});
