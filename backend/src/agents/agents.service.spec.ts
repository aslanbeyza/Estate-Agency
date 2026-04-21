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
      aggregate: jest.fn(),
    };
    transactionModel = {
      find: jest.fn(),
    };
    service = new AgentsService(agentModel, transactionModel);
  });

  describe('findAll', () => {
    it('filters out soft-deleted agents', async () => {
      const execSpy = jest.fn().mockResolvedValue([]);
      const sortSpy = jest.fn().mockReturnValue({ exec: execSpy });
      agentModel.find.mockReturnValue({ sort: sortSpy });

      await service.findAll();

      expect(agentModel.find).toHaveBeenCalledWith({ deletedAt: null });
    });
  });

  describe('findOne', () => {
    it('returns the agent when found', async () => {
      const agent = { _id: agentId, name: 'A', email: 'a@a.com' };
      agentModel.findById.mockReturnValue({
        exec: () => Promise.resolve(agent),
      });
      await expect(service.findOne(agentId)).resolves.toEqual(agent);
    });

    it('throws NotFoundException when missing', async () => {
      agentModel.findById.mockReturnValue({
        exec: () => Promise.resolve(null),
      });
      await expect(service.findOne(agentId)).rejects.toThrow(NotFoundException);
    });

    it('still resolves soft-deleted agents (so populate history works)', async () => {
      const deletedAgent = {
        _id: agentId,
        name: 'A',
        email: 'a@a.com',
        deletedAt: new Date(),
      };
      agentModel.findById.mockReturnValue({
        exec: () => Promise.resolve(deletedAgent),
      });
      await expect(service.findOne(agentId)).resolves.toEqual(deletedAgent);
    });
  });

  describe('remove', () => {
    it('soft-deletes the agent and returns a receipt', async () => {
      const save = jest.fn().mockResolvedValue({});
      const agent = { _id: agentId, deletedAt: null, save };
      agentModel.findById.mockReturnValue({
        exec: () => Promise.resolve(agent),
      });

      await expect(service.remove(agentId)).resolves.toEqual({
        deleted: true,
        id: agentId,
      });
      expect(agent.deletedAt).toBeInstanceOf(Date);
      expect(save).toHaveBeenCalledTimes(1);
    });

    it('is idempotent on an already-deleted agent (no second save)', async () => {
      const save = jest.fn();
      const alreadyDeleted = {
        _id: agentId,
        deletedAt: new Date('2026-01-01'),
        save,
      };
      agentModel.findById.mockReturnValue({
        exec: () => Promise.resolve(alreadyDeleted),
      });

      await expect(service.remove(agentId)).resolves.toEqual({
        deleted: true,
        id: agentId,
      });
      expect(save).not.toHaveBeenCalled();
    });

    it('throws when agent missing', async () => {
      agentModel.findById.mockReturnValue({
        exec: () => Promise.resolve(null),
      });
      await expect(service.remove(agentId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('earnings', () => {
    it('sums listing + selling breakdowns across completed transactions', async () => {
      const agent = { _id: agentId, name: 'Ayşe', email: 'ayse@a.com' };
      agentModel.findById.mockReturnValue({
        exec: () => Promise.resolve(agent),
      });

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

  describe('stats', () => {
    it('delegates to the aggregation pipeline and returns the result as-is', async () => {
      const rows = [
        {
          _id: agentId,
          name: 'Ayşe',
          email: 'ayse@a.com',
          deletedAt: null,
          listingCount: 3,
          sellingCount: 2,
          completedCount: 1,
          totalEarned: 25_000,
        },
      ];
      const execSpy = jest.fn().mockResolvedValue(rows);
      agentModel.aggregate.mockReturnValue({ exec: execSpy });

      await expect(service.stats()).resolves.toEqual(rows);

      // First pipeline stage must filter active agents — the whole point of
      // the endpoint is to never leak soft-deleted agents into the roster.
      const [pipeline] = agentModel.aggregate.mock.calls[0];
      expect(pipeline[0]).toEqual({ $match: { deletedAt: null } });
    });
  });

  describe('transactions (agent-lens feed)', () => {
    it('projects role = "listing" and uses listingAgentAmount as the share', async () => {
      const agent = { _id: agentId, name: 'Ayşe', email: 'ayse@a.com' };
      agentModel.findById.mockReturnValue({
        exec: () => Promise.resolve(agent),
      });

      const otherId = new Types.ObjectId().toString();
      const tx = {
        _id: 'tx1',
        propertyAddress: 'Moda',
        totalServiceFee: 10_000_000,
        stage: TransactionStage.COMPLETED,
        createdAt: new Date('2026-01-01'),
        listingAgent: {
          _id: agentId,
          name: 'Ayşe',
          email: 'a@a',
          deletedAt: null,
        },
        sellingAgent: {
          _id: otherId,
          name: 'Veli',
          email: 'v@v',
          deletedAt: null,
        },
        commissionBreakdown: {
          agencyAmount: 5_000_000,
          listingAgentAmount: 2_500_000,
          sellingAgentAmount: 2_500_000,
          scenario: 'different_agents',
        },
        isPayoutReady: true,
        isSameAgent: false,
      };

      transactionModel.find.mockReturnValue({
        populate: () => ({
          populate: () => ({
            sort: () => ({ exec: () => Promise.resolve([tx]) }),
          }),
        }),
      });

      const [view] = await service.transactions(agentId);
      expect(view.role).toBe('listing');
      expect(view.amount).toBe(2_500_000);
      expect(view.isPayoutReady).toBe(true);
      expect(view.isSameAgent).toBe(false);
      expect(view.listingAgent._id).toBe(agentId);
    });

    it('collapses same-agent scenario to role = "both" with the full agent pool', async () => {
      const agent = { _id: agentId, name: 'Solo', email: 'solo@a' };
      agentModel.findById.mockReturnValue({
        exec: () => Promise.resolve(agent),
      });

      const tx = {
        _id: 'tx1',
        propertyAddress: 'Moda',
        totalServiceFee: 10_000_000,
        stage: TransactionStage.COMPLETED,
        createdAt: new Date(),
        listingAgent: {
          _id: agentId,
          name: 'Solo',
          email: 's@s',
          deletedAt: null,
        },
        sellingAgent: {
          _id: agentId,
          name: 'Solo',
          email: 's@s',
          deletedAt: null,
        },
        commissionBreakdown: {
          agencyAmount: 5_000_000,
          listingAgentAmount: 5_000_000,
          sellingAgentAmount: 0,
          scenario: 'same_agent',
        },
        isPayoutReady: true,
        isSameAgent: true,
      };

      transactionModel.find.mockReturnValue({
        populate: () => ({
          populate: () => ({
            sort: () => ({ exec: () => Promise.resolve([tx]) }),
          }),
        }),
      });

      const [view] = await service.transactions(agentId);
      expect(view.role).toBe('both');
      // Same-agent puts the entire agent pool on listingAgentAmount; the view
      // intentionally reads that side so the UI doesn't need to know the rule.
      expect(view.amount).toBe(5_000_000);
      expect(view.isSameAgent).toBe(true);
    });

    it('returns amount = null for transactions that have not yet been paid out', async () => {
      const agent = { _id: agentId, name: 'Ayşe', email: 'ayse@a' };
      agentModel.findById.mockReturnValue({
        exec: () => Promise.resolve(agent),
      });

      const otherId = new Types.ObjectId().toString();
      const tx = {
        _id: 'tx1',
        propertyAddress: 'Moda',
        totalServiceFee: 10_000_000,
        stage: TransactionStage.AGREEMENT,
        createdAt: new Date(),
        listingAgent: {
          _id: agentId,
          name: 'Ayşe',
          email: 'a@a',
          deletedAt: null,
        },
        sellingAgent: {
          _id: otherId,
          name: 'Veli',
          email: 'v@v',
          deletedAt: null,
        },
        commissionBreakdown: undefined,
        isPayoutReady: false,
        isSameAgent: false,
      };

      transactionModel.find.mockReturnValue({
        populate: () => ({
          populate: () => ({
            sort: () => ({ exec: () => Promise.resolve([tx]) }),
          }),
        }),
      });

      const [view] = await service.transactions(agentId);
      expect(view.isPayoutReady).toBe(false);
      expect(view.amount).toBeNull();
    });

    it('works for soft-deleted agents (history must stay accessible)', async () => {
      const deletedAgent = {
        _id: agentId,
        name: 'Gone',
        email: 'g@g',
        deletedAt: new Date(),
      };
      agentModel.findById.mockReturnValue({
        exec: () => Promise.resolve(deletedAgent),
      });
      transactionModel.find.mockReturnValue({
        populate: () => ({
          populate: () => ({
            sort: () => ({ exec: () => Promise.resolve([]) }),
          }),
        }),
      });

      await expect(service.transactions(agentId)).resolves.toEqual([]);
    });
  });
});
