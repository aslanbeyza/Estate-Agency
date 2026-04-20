import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CommissionService } from '../commission/commission.service';
import { TransactionStage } from './transaction.schema';
import { TransactionsService } from './transactions.service';

const mockSave = jest.fn();
const mockTransaction = (overrides = {}) => ({
  _id: 'tx1',
  propertyAddress: 'Test Sokak 1',
  totalServiceFee: 100_000,
  stage: TransactionStage.AGREEMENT,
  listingAgent: { toString: () => 'agent1' },
  sellingAgent: { toString: () => 'agent2' },
  commissionBreakdown: undefined,
  save: mockSave,
  ...overrides,
});

const mockTransactionModel = {
  findById: jest.fn(),
  find: jest.fn(),
  save: mockSave,
};

describe('TransactionsService — Stage Geçişleri', () => {
  let service: TransactionsService;
  let commissionService: CommissionService;

  beforeEach(() => {
    commissionService = new CommissionService();
    service = new TransactionsService(mockTransactionModel as any, commissionService);
    jest.clearAllMocks();
    mockSave.mockResolvedValue({});
  });

  it('agreement → earnest_money geçişine izin vermeli', async () => {
    const tx = mockTransaction({ stage: TransactionStage.AGREEMENT });
    mockTransactionModel.findById.mockReturnValue({ exec: () => Promise.resolve(tx) });

    await service.updateStage('tx1', { stage: TransactionStage.EARNEST_MONEY });
    expect(tx.stage).toBe(TransactionStage.EARNEST_MONEY);
  });

  it('earnest_money → title_deed geçişine izin vermeli', async () => {
    const tx = mockTransaction({ stage: TransactionStage.EARNEST_MONEY });
    mockTransactionModel.findById.mockReturnValue({ exec: () => Promise.resolve(tx) });

    await service.updateStage('tx1', { stage: TransactionStage.TITLE_DEED });
    expect(tx.stage).toBe(TransactionStage.TITLE_DEED);
  });

  it('title_deed → completed geçişinde komisyon hesaplamalı', async () => {
    const tx = mockTransaction({ stage: TransactionStage.TITLE_DEED });
    mockTransactionModel.findById.mockReturnValue({ exec: () => Promise.resolve(tx) });

    await service.updateStage('tx1', { stage: TransactionStage.COMPLETED });
    expect(tx.commissionBreakdown).toBeDefined();
    expect((tx.commissionBreakdown as any).agencyAmount).toBe(50_000);
  });

  it('geçersiz geçiş (agreement → completed) BadRequestException fırlatmalı', async () => {
    const tx = mockTransaction({ stage: TransactionStage.AGREEMENT });
    mockTransactionModel.findById.mockReturnValue({ exec: () => Promise.resolve(tx) });

    await expect(
      service.updateStage('tx1', { stage: TransactionStage.COMPLETED }),
    ).rejects.toThrow(BadRequestException);
  });

  it('completed → herhangi bir stage geçişi BadRequestException fırlatmalı', async () => {
    const tx = mockTransaction({ stage: TransactionStage.COMPLETED });
    mockTransactionModel.findById.mockReturnValue({ exec: () => Promise.resolve(tx) });

    await expect(
      service.updateStage('tx1', { stage: TransactionStage.TITLE_DEED }),
    ).rejects.toThrow(BadRequestException);
  });

  it('bulunamayan transaction NotFoundException fırlatmalı', async () => {
    mockTransactionModel.findById.mockReturnValue({ exec: () => Promise.resolve(null) });

    await expect(
      service.updateStage('nonexistent', { stage: TransactionStage.EARNEST_MONEY }),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('TransactionsService — Breakdown', () => {
  let service: TransactionsService;
  const commissionService = new CommissionService();

  beforeEach(() => {
    service = new TransactionsService(mockTransactionModel as any, commissionService);
    jest.clearAllMocks();
  });

  it('completed değilse breakdown isteği BadRequestException fırlatır', async () => {
    const tx = mockTransaction({
      stage: TransactionStage.TITLE_DEED,
      commissionBreakdown: undefined,
    });
    mockTransactionModel.findById.mockReturnValue({
      populate: () => ({
        populate: () => ({ exec: () => Promise.resolve(tx) }),
      }),
    });

    await expect(service.getBreakdown('tx1')).rejects.toThrow(BadRequestException);
  });

  it('completed transaction için breakdown payload döndürür', async () => {
    const breakdown = {
      agencyAmount: 50_000,
      listingAgentAmount: 25_000,
      sellingAgentAmount: 25_000,
      scenario: 'different_agents' as const,
    };
    const tx = mockTransaction({
      _id: 'tx1',
      propertyAddress: 'Moda Sok 1',
      totalServiceFee: 100_000,
      stage: TransactionStage.COMPLETED,
      commissionBreakdown: breakdown,
    });
    mockTransactionModel.findById.mockReturnValue({
      populate: () => ({
        populate: () => ({ exec: () => Promise.resolve(tx) }),
      }),
    });

    const result = await service.getBreakdown('tx1');
    expect(result).toEqual({
      transactionId: 'tx1',
      propertyAddress: 'Moda Sok 1',
      totalServiceFee: 100_000,
      breakdown,
    });
  });
});
