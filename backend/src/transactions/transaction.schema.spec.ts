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
