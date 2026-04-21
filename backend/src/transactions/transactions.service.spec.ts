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

const ACTOR_ID = '507f1f77bcf86cd799439011';
const mockSave = jest.fn();
const mockTransaction = (overrides = {}) => ({
  _id: 'tx1',
  propertyAddress: 'Test Sokak 1',
  totalServiceFee: 100_000,
  stage: TransactionStage.AGREEMENT,
  listingAgent: { toString: () => 'agent1' },
  sellingAgent: { toString: () => 'agent2' },
  commissionBreakdown: undefined,
  stageHistory: [],
  save: mockSave,
  ...overrides,
});

const mockTransactionModel = {
  findById: jest.fn(),
  find: jest.fn(),
  countDocuments: jest.fn(),
  aggregate: jest.fn(),
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

    await service.updateStage(
      'tx1',
      { stage: TransactionStage.EARNEST_MONEY },
      ACTOR_ID,
    );
    expect(tx.stage).toBe(TransactionStage.EARNEST_MONEY);
  });

  it('earnest_money → title_deed geçişine izin vermeli', async () => {
    const tx = mockTransaction({ stage: TransactionStage.EARNEST_MONEY });
    mockTransactionModel.findById.mockReturnValue({
      exec: () => Promise.resolve(tx),
    });

    await service.updateStage(
      'tx1',
      { stage: TransactionStage.TITLE_DEED },
      ACTOR_ID,
    );
    expect(tx.stage).toBe(TransactionStage.TITLE_DEED);
  });

  it('title_deed → completed geçişinde komisyon hesaplamalı', async () => {
    const tx = mockTransaction({ stage: TransactionStage.TITLE_DEED });
    mockTransactionModel.findById.mockReturnValue({
      exec: () => Promise.resolve(tx),
    });

    await service.updateStage(
      'tx1',
      { stage: TransactionStage.COMPLETED },
      ACTOR_ID,
    );
    expect(tx.commissionBreakdown).toBeDefined();
    expect((tx.commissionBreakdown as any).agencyAmount).toBe(50_000);
  });

  it('stage transition stageHistory dizisine actor bilgisiyle entry ekler', async () => {
    const tx = mockTransaction({ stage: TransactionStage.AGREEMENT });
    mockTransactionModel.findById.mockReturnValue({
      exec: () => Promise.resolve(tx),
    });

    await service.updateStage(
      'tx1',
      { stage: TransactionStage.EARNEST_MONEY },
      ACTOR_ID,
    );

    const history = tx.stageHistory as Array<{
      stage: TransactionStage;
      by: { toString(): string };
      at: Date;
    }>;
    expect(history).toHaveLength(1);
    expect(history[0].stage).toBe(TransactionStage.EARNEST_MONEY);
    expect(history[0].by.toString()).toBe(ACTOR_ID);
    expect(history[0].at).toBeInstanceOf(Date);
  });

  it('geçersiz geçiş (agreement → completed) BadRequestException fırlatmalı', async () => {
    const tx = mockTransaction({ stage: TransactionStage.AGREEMENT });
    mockTransactionModel.findById.mockReturnValue({
      exec: () => Promise.resolve(tx),
    });

    await expect(
      service.updateStage(
        'tx1',
        { stage: TransactionStage.COMPLETED },
        ACTOR_ID,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('completed → herhangi bir stage geçişi BadRequestException fırlatmalı', async () => {
    const tx = mockTransaction({ stage: TransactionStage.COMPLETED });
    mockTransactionModel.findById.mockReturnValue({
      exec: () => Promise.resolve(tx),
    });

    await expect(
      service.updateStage(
        'tx1',
        { stage: TransactionStage.TITLE_DEED },
        ACTOR_ID,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('bulunamayan transaction NotFoundException fırlatmalı', async () => {
    mockTransactionModel.findById.mockReturnValue({
      exec: () => Promise.resolve(null),
    });

    await expect(
      service.updateStage(
        'nonexistent',
        { stage: TransactionStage.EARNEST_MONEY },
        ACTOR_ID,
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('eş zamanlı güncelleme (VersionError) → ConflictException(409) fırlatmalı', async () => {
    const tx = mockTransaction({ stage: TransactionStage.AGREEMENT });
    mockTransactionModel.findById.mockReturnValue({
      exec: () => Promise.resolve(tx),
    });
    const versionError = new MongooseError.VersionError(
      { _doc: { _id: 'tx1' } } as any,
      0,
      ['stage'],
    );
    mockSave.mockRejectedValueOnce(versionError);

    await expect(
      service.updateStage(
        'tx1',
        { stage: TransactionStage.EARNEST_MONEY },
        ACTOR_ID,
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('beklenmedik save hatası yutulmamalı (raw throw)', async () => {
    const tx = mockTransaction({ stage: TransactionStage.AGREEMENT });
    mockTransactionModel.findById.mockReturnValue({
      exec: () => Promise.resolve(tx),
    });
    mockSave.mockRejectedValueOnce(new Error('connection reset'));

    await expect(
      service.updateStage(
        'tx1',
        { stage: TransactionStage.EARNEST_MONEY },
        ACTOR_ID,
      ),
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

    await service.create(dto, ACTOR_ID);

    expect(mockAgentModel.find).toHaveBeenCalledWith({
      _id: { $in: ['listing1', 'selling1'] },
      deletedAt: null,
    });
    // Audit fields are stamped server-side, not taken from the DTO.
    expect(TxCtor).toHaveBeenCalledWith(
      expect.objectContaining({
        ...dto,
        createdBy: expect.anything(),
        stageHistory: expect.arrayContaining([
          expect.objectContaining({
            stage: TransactionStage.AGREEMENT,
          }),
        ]),
      }),
    );
    expect(saveSpy).toHaveBeenCalledTimes(1);
  });

  it('silinmiş ajan referansı BadRequestException fırlatmalı', async () => {
    const dto = {
      propertyAddress: 'Moda Sok',
      totalServiceFee: 10_000_000,
      listingAgent: 'listing1',
      sellingAgent: 'deletedOne',
    };
    mockActiveAgents(['listing1']);

    await expect(service.create(dto, ACTOR_ID)).rejects.toMatchObject({
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

    await service.create(dto, ACTOR_ID);

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

  const buildPopulateChain = (tx: unknown) => {
    const link = (): any => ({
      populate: link,
      exec: () => Promise.resolve(tx),
    });
    return link();
  };

  it('completed değilse breakdown isteği BadRequestException fırlatır', async () => {
    const tx = mockTransaction({
      stage: TransactionStage.TITLE_DEED,
      commissionBreakdown: undefined,
    });
    mockTransactionModel.findById.mockReturnValue(buildPopulateChain(tx));

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
    mockTransactionModel.findById.mockReturnValue(buildPopulateChain(tx));

    const result = await service.getBreakdown('tx1');
    expect(result).toEqual({
      transactionId: 'tx1',
      propertyAddress: 'Moda Sok 1',
      totalServiceFee: 100_000,
      breakdown,
    });
  });
});

describe('TransactionsService — Pagination', () => {
  let service: TransactionsService;

  beforeEach(() => {
    service = new TransactionsService(
      mockTransactionModel as any,
      mockAgentModel as any,
      new CommissionService(stubPolicyService),
    );
    jest.clearAllMocks();
  });

  const buildListChain = (items: unknown[]) => {
    const chain: any = {
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      populate: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue(items),
    };
    return chain;
  };

  it('limit default 20, offset default 0, sort createdAt desc + _id tiebreaker', async () => {
    const items = Array.from({ length: 20 }, (_, i) => ({ _id: `t${i}` }));
    const listChain = buildListChain(items);
    mockTransactionModel.find.mockReturnValue(listChain);
    mockTransactionModel.countDocuments.mockReturnValue({
      exec: () => Promise.resolve(42),
    });

    const res = await service.findPaginated({});

    expect(mockTransactionModel.find).toHaveBeenCalledWith({});
    expect(listChain.sort).toHaveBeenCalledWith({ createdAt: -1, _id: -1 });
    expect(listChain.skip).toHaveBeenCalledWith(0);
    expect(listChain.limit).toHaveBeenCalledWith(20);
    expect(res).toEqual({
      items,
      total: 42,
      limit: 20,
      offset: 0,
      hasMore: true,
    });
  });

  it('stage filtresi hem find hem countDocuments filter argümanına gider', async () => {
    const listChain = buildListChain([]);
    mockTransactionModel.find.mockReturnValue(listChain);
    const countExec = jest.fn().mockResolvedValue(0);
    mockTransactionModel.countDocuments.mockReturnValue({ exec: countExec });

    await service.findPaginated({ stage: TransactionStage.COMPLETED });

    expect(mockTransactionModel.find).toHaveBeenCalledWith({
      stage: TransactionStage.COMPLETED,
    });
    expect(mockTransactionModel.countDocuments).toHaveBeenCalledWith({
      stage: TransactionStage.COMPLETED,
    });
  });

  it('hasMore: offset + items.length >= total iken false', async () => {
    const items = [{ _id: 'a' }, { _id: 'b' }];
    mockTransactionModel.find.mockReturnValue(buildListChain(items));
    mockTransactionModel.countDocuments.mockReturnValue({
      exec: () => Promise.resolve(12), // 10 + 2 = 12 → son sayfa
    });

    const res = await service.findPaginated({ limit: 10, offset: 10 });
    expect(res.hasMore).toBe(false);
  });

  it('limit üst sınırı 100 (DTO bypass edilse bile servis clamp eder)', async () => {
    const listChain = buildListChain([]);
    mockTransactionModel.find.mockReturnValue(listChain);
    mockTransactionModel.countDocuments.mockReturnValue({
      exec: () => Promise.resolve(0),
    });

    await service.findPaginated({ limit: 10_000 } as any);

    expect(listChain.limit).toHaveBeenCalledWith(100);
  });

  it('limit alt sınırı 1', async () => {
    const listChain = buildListChain([]);
    mockTransactionModel.find.mockReturnValue(listChain);
    mockTransactionModel.countDocuments.mockReturnValue({
      exec: () => Promise.resolve(0),
    });

    await service.findPaginated({ limit: 0 } as any);

    expect(listChain.limit).toHaveBeenCalledWith(1);
  });

  it('negatif offset 0 olur', async () => {
    const listChain = buildListChain([]);
    mockTransactionModel.find.mockReturnValue(listChain);
    mockTransactionModel.countDocuments.mockReturnValue({
      exec: () => Promise.resolve(0),
    });

    await service.findPaginated({ offset: -5 } as any);

    expect(listChain.skip).toHaveBeenCalledWith(0);
  });
});

describe('TransactionsService — Stats', () => {
  let service: TransactionsService;

  beforeEach(() => {
    service = new TransactionsService(
      mockTransactionModel as any,
      mockAgentModel as any,
      new CommissionService(stubPolicyService),
    );
    jest.clearAllMocks();
  });

  it('aggregation sonucunu counts + totalAgencyRevenue + totalCompletedServiceFee olarak döner', async () => {
    mockTransactionModel.aggregate.mockReturnValue({
      exec: () =>
        Promise.resolve([
          {
            total: 10,
            agreement: 3,
            earnest_money: 2,
            title_deed: 1,
            completed: 4,
            totalAgencyRevenue: 200_000,
            totalCompletedServiceFee: 400_000,
          },
        ]),
    });

    const res = await service.stats();
    expect(res).toEqual({
      total: 10,
      totalAgencyRevenue: 200_000,
      totalCompletedServiceFee: 400_000,
      counts: {
        agreement: 3,
        earnest_money: 2,
        title_deed: 1,
        completed: 4,
      },
    });
  });

  it('tablo boşsa sıfırlı payload döner (dashboard ilk açılışta patlamaz)', async () => {
    mockTransactionModel.aggregate.mockReturnValue({
      exec: () => Promise.resolve([]),
    });

    const res = await service.stats();
    expect(res).toEqual({
      total: 0,
      totalAgencyRevenue: 0,
      totalCompletedServiceFee: 0,
      counts: {
        agreement: 0,
        earnest_money: 0,
        title_deed: 0,
        completed: 0,
      },
    });
  });

  it('eksik alanlar 0 olarak doldurulur (aggregation defensive)', async () => {
    mockTransactionModel.aggregate.mockReturnValue({
      exec: () =>
        Promise.resolve([{ total: 5, agreement: 5 }]),
    });

    const res = await service.stats();
    expect(res.counts).toEqual({
      agreement: 5,
      earnest_money: 0,
      title_deed: 0,
      completed: 0,
    });
    expect(res.totalAgencyRevenue).toBe(0);
    expect(res.totalCompletedServiceFee).toBe(0);
  });
});
