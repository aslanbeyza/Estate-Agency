import { model, Types } from 'mongoose';
import {
  Transaction,
  TransactionSchema,
  TransactionStage,
} from './transaction.schema';

/**
 * Direct unit tests for the Mongoose-level derived flags. These are the
 * single source of truth for "is this transaction payout-ready?" and
 * "is this the same-agent scenario?" — the frontend reads them verbatim
 * instead of re-implementing the rules.
 */
describe('Transaction schema virtuals', () => {
  const TransactionModel = model(Transaction.name, TransactionSchema);

  const baseDoc = {
    propertyAddress: 'Moda Sok 1',
    totalServiceFee: 10_000_000,
    listingAgent: new Types.ObjectId(),
    sellingAgent: new Types.ObjectId(),
  };

  describe('isPayoutReady', () => {
    it('is false while the stage is still in progress', () => {
      const tx = new TransactionModel({
        ...baseDoc,
        stage: TransactionStage.AGREEMENT,
      });
      expect(tx.get('isPayoutReady')).toBe(false);
    });

    it('is false when completed but the breakdown has not been written yet', () => {
      const tx = new TransactionModel({
        ...baseDoc,
        stage: TransactionStage.COMPLETED,
      });
      expect(tx.get('isPayoutReady')).toBe(false);
    });

    it('is true when completed *and* the breakdown is present', () => {
      const tx = new TransactionModel({
        ...baseDoc,
        stage: TransactionStage.COMPLETED,
        commissionBreakdown: {
          agencyAmount: 5_000_000,
          listingAgentAmount: 2_500_000,
          sellingAgentAmount: 2_500_000,
          scenario: 'different_agents',
        },
      });
      expect(tx.get('isPayoutReady')).toBe(true);
    });
  });

  describe('isSameAgent', () => {
    it('is true when listing and selling resolve to the same id', () => {
      const agent = new Types.ObjectId();
      const tx = new TransactionModel({
        ...baseDoc,
        listingAgent: agent,
        sellingAgent: agent,
      });
      expect(tx.get('isSameAgent')).toBe(true);
    });

    it('is false when the two agents differ', () => {
      const tx = new TransactionModel(baseDoc);
      expect(tx.get('isSameAgent')).toBe(false);
    });
  });

  describe('indexes', () => {
    // These indexes are load-bearing for every dashboard query — see the
    // comments in `transaction.schema.ts`. The tests below exist so that
    // accidentally removing one in a future refactor fails CI rather than
    // silently triggering collection scans in production.
    const indexKeys = TransactionSchema.indexes().map(([spec]) => spec);

    const hasIndex = (expected: Record<string, number>) =>
      indexKeys.some(
        (spec) =>
          Object.keys(spec).length === Object.keys(expected).length &&
          Object.entries(expected).every(([k, v]) => spec[k] === v),
      );

    it('declares the unfiltered-list compound index', () => {
      expect(hasIndex({ createdAt: -1, _id: -1 })).toBe(true);
    });

    it('declares the stage-filtered list compound index (ESR)', () => {
      expect(hasIndex({ stage: 1, createdAt: -1, _id: -1 })).toBe(true);
    });

    it('declares per-agent compound indexes covering the $or union', () => {
      expect(hasIndex({ listingAgent: 1, stage: 1, createdAt: -1 })).toBe(true);
      expect(hasIndex({ sellingAgent: 1, stage: 1, createdAt: -1 })).toBe(true);
    });
  });

  describe('JSON serialisation', () => {
    it('ships both virtuals and strips the __v version key', () => {
      const tx = new TransactionModel({
        ...baseDoc,
        stage: TransactionStage.COMPLETED,
        commissionBreakdown: {
          agencyAmount: 5_000_000,
          listingAgentAmount: 2_500_000,
          sellingAgentAmount: 2_500_000,
          scenario: 'different_agents',
        },
      });
      const json = tx.toJSON();
      expect(json).toHaveProperty('isPayoutReady', true);
      expect(json).toHaveProperty('isSameAgent', false);
      expect(json).not.toHaveProperty('__v');
    });
  });
});
