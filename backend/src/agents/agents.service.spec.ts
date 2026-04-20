import { NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { AgentsService } from './agents.service';
import { TransactionStage } from '../transactions/transaction.schema';

describe('AgentsService', () => {
  let service: AgentsService;
  let agentModel: any;
  let transactionModel: any;

  const agentId = new Types.ObjectId().toString();

  beforeEach(() => {
    agentModel = {
      find: jest.fn(),
      findById: jest.fn(),
      findByIdAndDelete: jest.fn(),
    };
    transactionModel = {
      find: jest.fn(),
    };
    service = new AgentsService(agentModel, transactionModel);
  });

  describe('findOne', () => {
    it('returns the agent when found', async () => {
      const agent = { _id: agentId, name: 'A', email: 'a@a.com' };
      agentModel.findById.mockReturnValue({ exec: () => Promise.resolve(agent) });
      await expect(service.findOne(agentId)).resolves.toEqual(agent);
    });

    it('throws NotFoundException when missing', async () => {
      agentModel.findById.mockReturnValue({ exec: () => Promise.resolve(null) });
      await expect(service.findOne(agentId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('returns a deletion receipt on success', async () => {
      agentModel.findByIdAndDelete.mockReturnValue({ exec: () => Promise.resolve({ _id: agentId }) });
      await expect(service.remove(agentId)).resolves.toEqual({ deleted: true, id: agentId });
    });

    it('throws when agent missing', async () => {
      agentModel.findByIdAndDelete.mockReturnValue({ exec: () => Promise.resolve(null) });
      await expect(service.remove(agentId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('earnings', () => {
    it('sums listing + selling breakdowns across completed transactions', async () => {
      const agent = { _id: agentId, name: 'Ayşe', email: 'ayse@a.com' };
      agentModel.findById.mockReturnValue({ exec: () => Promise.resolve(agent) });

      const otherAgent = new Types.ObjectId();
      transactionModel.find.mockReturnValue({
        lean: () => ({
          exec: () =>
            Promise.resolve([
              {
                _id: '1',
                stage: TransactionStage.COMPLETED,
                listingAgent: agentId,
                sellingAgent: otherAgent.toString(),
                commissionBreakdown: {
                  agencyAmount: 50_000,
                  listingAgentAmount: 25_000,
                  sellingAgentAmount: 25_000,
                  scenario: 'different_agents',
                },
              },
              {
                _id: '2',
                stage: TransactionStage.COMPLETED,
                listingAgent: agentId,
                sellingAgent: agentId,
                commissionBreakdown: {
                  agencyAmount: 30_000,
                  listingAgentAmount: 30_000,
                  sellingAgentAmount: 0,
                  scenario: 'same_agent',
                },
              },
            ]),
        }),
      });

      const report = await service.earnings(agentId);
      expect(report.completedTransactionCount).toBe(2);
      expect(report.asListingAgent).toBe(55_000);
      expect(report.asSellingAgent).toBe(0);
      expect(report.totalEarned).toBe(55_000);
    });

    it('returns zeros when the agent has no completed transactions', async () => {
      agentModel.findById.mockReturnValue({
        exec: () => Promise.resolve({ _id: agentId, name: 'X', email: 'x@y' }),
      });
      transactionModel.find.mockReturnValue({
        lean: () => ({ exec: () => Promise.resolve([]) }),
      });

      const report = await service.earnings(agentId);
      expect(report.totalEarned).toBe(0);
      expect(report.completedTransactionCount).toBe(0);
    });
  });
});
