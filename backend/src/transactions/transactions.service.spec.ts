import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Error as MongooseError } from 'mongoose';
import { CommissionService } from '../commission/commission.service';
import {
  CommissionPolicyService,
  DEFAULT_COMMISSION_POLICY,
} from '../commission/commission.policy';
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

const mockAgentModel = {
  find: jest.fn(),
};

// Minimal stub: the stage-transition tests don't care about the policy, only
// that CommissionService can be constructed and called. Using the default
// policy keeps every existing assertion numerically stable.
const stubPolicyService = {
  current: () => ({ ...DEFAULT_COMMISSION_POLICY }),
} as unknown as CommissionPolicyService;

describe('TransactionsService — Stage Geçişleri', () => {
  let service: TransactionsService;
  let commissionService: CommissionService;

  beforeEach(() => {
    commissionService = new CommissionService(stubPolicyService);
    service = new TransactionsService(
      mockTransactionModel as any,
      mockAgentModel as any,
      commissionService,
    );
    jest.clearAllMocks();
    mockSave.mockResolvedValue({});
  });

  it('agreement → earnest_money geçişine izin vermeli', async () => {
    const tx = mockTransaction({ stage: TransactionStage.AGREEMENT });
    mockTransactionModel.findById.mockReturnValue({
      exec: () => Promise.resolve(tx),
    });

    await service.updateStage('tx1', { stage: TransactionStage.EARNEST_MONEY });
    expect(tx.stage).toBe(TransactionStage.EARNEST_MONEY);
  });

  it('earnest_money → title_deed geçişine izin vermeli', async () => {
    const tx = mockTransaction({ stage: TransactionStage.EARNEST_MONEY });
    mockTransactionModel.findById.mockReturnValue({
      exec: () => Promise.resolve(tx),
    });

    await service.updateStage('tx1', { stage: TransactionStage.TITLE_DEED });
    expect(tx.stage).toBe(TransactionStage.TITLE_DEED);
  });

  it('title_deed → completed geçişinde komisyon hesaplamalı', async () => {
    const tx = mockTransaction({ stage: TransactionStage.TITLE_DEED });
    mockTransactionModel.findById.mockReturnValue({
      exec: () => Promise.resolve(tx),
    });

    await service.updateStage('tx1', { stage: TransactionStage.COMPLETED });
    expect(tx.commissionBreakdown).toBeDefined();
    expect((tx.commissionBreakdown as any).agencyAmount).toBe(50_000);
  });

  it('geçersiz geçiş (agreement → completed) BadRequestException fırlatmalı', async () => {
    const tx = mockTransaction({ stage: TransactionStage.AGREEMENT });
    mockTransactionModel.findById.mockReturnValue({
      exec: () => Promise.resolve(tx),
    });

    await expect(
      service.updateStage('tx1', { stage: TransactionStage.COMPLETED }),
    ).rejects.toThrow(BadRequestException);
  });

  it('completed → herhangi bir stage geçişi BadRequestException fırlatmalı', async () => {
    const tx = mockTransaction({ stage: TransactionStage.COMPLETED });
    mockTransactionModel.findById.mockReturnValue({
      exec: () => Promise.resolve(tx),
    });

    await expect(
      service.updateStage('tx1', { stage: TransactionStage.TITLE_DEED }),
    ).rejects.toThrow(BadRequestException);
  });

  it('bulunamayan transaction NotFoundException fırlatmalı', async () => {
    mockTransactionModel.findById.mockReturnValue({
      exec: () => Promise.resolve(null),
    });

    await expect(
      service.updateStage('nonexistent', {
        stage: TransactionStage.EARNEST_MONEY,
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('eş zamanlı güncelleme (VersionError) → ConflictException(409) fırlatmalı', async () => {
    const tx = mockTransaction({ stage: TransactionStage.AGREEMENT });
    mockTransactionModel.findById.mockReturnValue({
      exec: () => Promise.resolve(tx),
    });
    // Başka bir istek arada __v'yi bumpladı: optimistic concurrency VersionError fırlatır.
    // VersionError ctor `doc._doc._id` okuduğu için _doc shape'i gerekiyor.
    const versionError = new MongooseError.VersionError(
      { _doc: { _id: 'tx1' } } as any,
      0,
      ['stage'],
    );
    mockSave.mockRejectedValueOnce(versionError);

    await expect(
      service.updateStage('tx1', { stage: TransactionStage.EARNEST_MONEY }),
    ).rejects.toThrow(ConflictException);
  });

  it('beklenmedik save hatası yutulmamalı (raw throw)', async () => {
    const tx = mockTransaction({ stage: TransactionStage.AGREEMENT });
    mockTransactionModel.findById.mockReturnValue({
      exec: () => Promise.resolve(tx),
    });
    mockSave.mockRejectedValueOnce(new Error('connection reset'));

    await expect(
      service.updateStage('tx1', { stage: TransactionStage.EARNEST_MONEY }),
    ).rejects.toThrow('connection reset');
  });
});

describe('TransactionsService — Create (soft-delete integrity)', () => {
  let service: TransactionsService;

  const mockActiveAgents = (ids: string[]) => {
    mockAgentModel.find.mockReturnValue({
      select: () => ({
        lean: () => ({
          exec: () => Promise.resolve(ids.map((id) => ({ _id: id }))),
        }),
      }),
    });
  };

  beforeEach(() => {
    service = new TransactionsService(
      mockTransactionModel as any,
      mockAgentModel as any,
      new CommissionService(stubPolicyService),
    );
    jest.clearAllMocks();
  });

  it('iki aktif ajanla oluşturulabilir', async () => {
    const dto = {
      propertyAddress: 'Moda Sok',
      totalServiceFee: 10_000_000,
      listingAgent: 'listing1',
      sellingAgent: 'selling1',
    };
    mockActiveAgents(['listing1', 'selling1']);

    // `new this.transactionModel(dto).save()` çağrısını mockla
    const saveSpy = jest.fn().mockResolvedValue({ _id: 'newTx', ...dto });
    const TxCtor = jest.fn().mockImplementation(() => ({ save: saveSpy }));
    (service as any).transactionModel = Object.assign(
      TxCtor,
      mockTransactionModel,
    );
    (service as any).agentModel = mockAgentModel;

    await service.create(dto);

    expect(mockAgentModel.find).toHaveBeenCalledWith({
      _id: { $in: ['listing1', 'selling1'] },
      deletedAt: null,
    });
    expect(TxCtor).toHaveBeenCalledWith(dto);
    expect(saveSpy).toHaveBeenCalledTimes(1);
  });

  it('silinmiş ajan referansı BadRequestException fırlatmalı', async () => {
    const dto = {
      propertyAddress: 'Moda Sok',
      totalServiceFee: 10_000_000,
      listingAgent: 'listing1',
      sellingAgent: 'deletedOne',
    };
    // Sadece listing aktif dönüyor; sellingAgent soft-deleted → filter'dan düşüyor.
    mockActiveAgents(['listing1']);

    await expect(service.create(dto)).rejects.toMatchObject({
      message: expect.stringContaining('deletedOne'),
      name: 'BadRequestException',
    });
  });

  it('aynı ajan hem listing hem selling ise tek aktif kontrolü yeterli', async () => {
    const dto = {
      propertyAddress: 'Moda Sok',
      totalServiceFee: 10_000_000,
      listingAgent: 'soloAgent',
      sellingAgent: 'soloAgent',
    };
    mockActiveAgents(['soloAgent']);

    const saveSpy = jest.fn().mockResolvedValue({ _id: 'newTx', ...dto });
    const TxCtor = jest.fn().mockImplementation(() => ({ save: saveSpy }));
    (service as any).transactionModel = Object.assign(
      TxCtor,
      mockTransactionModel,
    );
    (service as any).agentModel = mockAgentModel;

    await service.create(dto);

    expect(mockAgentModel.find).toHaveBeenCalledWith({
      _id: { $in: ['soloAgent'] },
      deletedAt: null,
    });
  });
});

describe('TransactionsService — Breakdown', () => {
  let service: TransactionsService;
  const commissionService = new CommissionService(stubPolicyService);

  beforeEach(() => {
    service = new TransactionsService(
      mockTransactionModel as any,
      mockAgentModel as any,
      commissionService,
    );
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

    await expect(service.getBreakdown('tx1')).rejects.toThrow(
      BadRequestException,
    );
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
