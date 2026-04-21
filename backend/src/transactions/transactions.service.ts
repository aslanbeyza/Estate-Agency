import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Error as MongooseError, Model, Types } from 'mongoose';
import { Agent, AgentDocument } from '../agents/agent.schema';
import { CommissionService } from '../commission/commission.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import {
  PaginatedResult,
  QueryTransactionsDto,
} from './dto/query-transactions.dto';
import { UpdateStageDto } from './dto/update-stage.dto';
import {
  Transaction,
  TransactionDocument,
  TransactionStage,
} from './transaction.schema';

/**
 * Aggregate counters returned by `GET /transactions/stats`. Separated from
 * the paginated list endpoint so the dashboard never has to load (or
 * count) every transaction to render its KPI cards.
 */
export interface TransactionStats {
  counts: Record<TransactionStage, number>;
  /** Total agency slice across all completed transactions (kuruş). */
  totalAgencyRevenue: number;
  /** Total `totalServiceFee` across completed transactions (kuruş). */
  totalCompletedServiceFee: number;
  total: number;
}

const VALID_TRANSITIONS: Partial<Record<TransactionStage, TransactionStage>> = {
  [TransactionStage.AGREEMENT]: TransactionStage.EARNEST_MONEY,
  [TransactionStage.EARNEST_MONEY]: TransactionStage.TITLE_DEED,
  [TransactionStage.TITLE_DEED]: TransactionStage.COMPLETED,
};

@Injectable()
export class TransactionsService {
  constructor(
    @InjectModel(Transaction.name)
    private transactionModel: Model<TransactionDocument>,
    @InjectModel(Agent.name) private agentModel: Model<AgentDocument>,
    private commissionService: CommissionService,
  ) {}

  async create(
    dto: CreateTransactionDto,
    actorUserId: string,
  ): Promise<TransactionDocument> {
    // Integrity guard: both agent references must point at active (non-soft-
    // deleted) agents. We check at create time only — existing transactions
    // intentionally keep their references after an agent is soft-deleted so
    // historical populate still resolves (see agent.schema.ts).
    const agentIds = Array.from(new Set([dto.listingAgent, dto.sellingAgent]));
    const activeAgents = await this.agentModel
      .find({ _id: { $in: agentIds }, deletedAt: null })
      .select('_id')
      .lean()
      .exec();

    if (activeAgents.length !== agentIds.length) {
      const activeIds = new Set(activeAgents.map((a) => String(a._id)));
      const missing = agentIds.filter((id) => !activeIds.has(id));
      throw new BadRequestException(
        `Agent(s) not found or already deleted: ${missing.join(', ')}`,
      );
    }

    // Stamp the audit trail at creation. Every transaction has at least
    // one `stageHistory` entry — the initial `agreement` — so queries
    // never have to deal with an empty array.
    const actorId = new Types.ObjectId(actorUserId);
    const now = new Date();
    return new this.transactionModel({
      ...dto,
      createdBy: actorId,
      stageHistory: [
        { stage: TransactionStage.AGREEMENT, at: now, by: actorId },
      ],
    }).save();
  }

  /**
   * Paginated list. The previous unbounded `find()` is deliberately gone:
   * any caller that wants "everything" has to explicitly ask for it via
   * `limit` and will still be capped at 100 by the DTO validator. This
   * closes the "one client pulls the entire collection" footgun.
   *
   * We issue `find(...).countDocuments(...)` in parallel (not a full
   * aggregation) because the filters are always the same across both
   * queries; MongoDB uses the same index for both, so the cost is well
   * below two independent aggregations.
   */
  async findPaginated(
    query: QueryTransactionsDto,
  ): Promise<PaginatedResult<TransactionDocument>> {
    // Defaults duplicated from the DTO for belt-and-braces safety. If a
    // caller bypasses validation (e.g. an internal service call), the
    // method still behaves sanely.
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
    const offset = Math.max(query.offset ?? 0, 0);

    const filter: Record<string, unknown> = {};
    if (query.stage) filter.stage = query.stage;

    const [items, total] = await Promise.all([
      this.transactionModel
        .find(filter)
        // Stable ordering is non-optional for offset pagination: without
        // it the same "page 2" request can return different rows as new
        // transactions arrive. `createdAt` + `_id` tiebreaker is
        // deterministic and matches the default Mongoose timestamps index.
        .sort({ createdAt: -1, _id: -1 })
        .skip(offset)
        .limit(limit)
        .populate('listingAgent', 'name email deletedAt')
        .populate('sellingAgent', 'name email deletedAt')
        .populate('createdBy', 'name email role')
        .populate('stageHistory.by', 'name email role')
        .exec(),
      this.transactionModel.countDocuments(filter).exec(),
    ]);

    return {
      items,
      total,
      limit,
      offset,
      hasMore: offset + items.length < total,
    };
  }

  /**
   * Dashboard KPI aggregation: counts per stage + total agency revenue
   * from completed transactions. Single pipeline pass; no documents ever
   * leave MongoDB.
   */
  async stats(): Promise<TransactionStats> {
    // Pipeline typed as `any[]` because `$cond` tuples and literal-typed
    // enum values trip Mongoose's very strict `PipelineStage` overloads.
    // The shape below is validated by the integration tests.
    const pipeline: any[] = [
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          agreement: {
            $sum: { $cond: [{ $eq: ['$stage', TransactionStage.AGREEMENT] }, 1, 0] },
          },
          earnest_money: {
            $sum: { $cond: [{ $eq: ['$stage', TransactionStage.EARNEST_MONEY] }, 1, 0] },
          },
          title_deed: {
            $sum: { $cond: [{ $eq: ['$stage', TransactionStage.TITLE_DEED] }, 1, 0] },
          },
          completed: {
            $sum: { $cond: [{ $eq: ['$stage', TransactionStage.COMPLETED] }, 1, 0] },
          },
          // Only completed transactions have a breakdown; `$ifNull` makes
          // the sum tolerate missing or in-flight breakdowns without
          // erroring out the whole aggregation.
          totalAgencyRevenue: {
            $sum: {
              $ifNull: ['$commissionBreakdown.agencyAmount', 0],
            },
          },
          totalCompletedServiceFee: {
            $sum: {
              $cond: [
                { $eq: ['$stage', TransactionStage.COMPLETED] },
                '$totalServiceFee',
                0,
              ],
            },
          },
        },
      },
    ];

    const [row] = await this.transactionModel.aggregate(pipeline).exec();
    const zeroCounts: Record<TransactionStage, number> = {
      [TransactionStage.AGREEMENT]: 0,
      [TransactionStage.EARNEST_MONEY]: 0,
      [TransactionStage.TITLE_DEED]: 0,
      [TransactionStage.COMPLETED]: 0,
    };

    if (!row) {
      return {
        counts: zeroCounts,
        totalAgencyRevenue: 0,
        totalCompletedServiceFee: 0,
        total: 0,
      };
    }

    return {
      counts: {
        [TransactionStage.AGREEMENT]: row.agreement ?? 0,
        [TransactionStage.EARNEST_MONEY]: row.earnest_money ?? 0,
        [TransactionStage.TITLE_DEED]: row.title_deed ?? 0,
        [TransactionStage.COMPLETED]: row.completed ?? 0,
      },
      totalAgencyRevenue: row.totalAgencyRevenue ?? 0,
      totalCompletedServiceFee: row.totalCompletedServiceFee ?? 0,
      total: row.total ?? 0,
    };
  }

  async findOne(id: string): Promise<TransactionDocument> {
    const tx = await this.transactionModel
      .findById(id)
      .populate('listingAgent', 'name email deletedAt')
      .populate('sellingAgent', 'name email deletedAt')
      .populate('createdBy', 'name email role')
      .populate('stageHistory.by', 'name email role')
      .exec();
    if (!tx) throw new NotFoundException(`Transaction ${id} not found`);
    return tx;
  }

  async updateStage(
    id: string,
    dto: UpdateStageDto,
    actorUserId: string,
  ): Promise<TransactionDocument> {
    const tx = await this.transactionModel.findById(id).exec();
    if (!tx) throw new NotFoundException(`Transaction ${id} not found`);

    const allowedNext = VALID_TRANSITIONS[tx.stage];
    if (!allowedNext || allowedNext !== dto.stage) {
      throw new BadRequestException(
        `Invalid stage transition: ${tx.stage} → ${dto.stage}. Expected: ${allowedNext ?? 'none (completed is final)'}`,
      );
    }

    tx.stage = dto.stage;
    tx.stageHistory.push({
      stage: dto.stage,
      at: new Date(),
      by: new Types.ObjectId(actorUserId),
    });

    if (dto.stage === TransactionStage.COMPLETED) {
      tx.commissionBreakdown = this.commissionService.calculate(
        tx.totalServiceFee,
        tx.listingAgent.toString(),
        tx.sellingAgent.toString(),
      );
    }

    try {
      return await tx.save();
    } catch (err) {
      // Optimistic-concurrency guard (see transaction.schema.ts).
      // If a concurrent writer advanced the same transaction between our
      // `findById` and `save`, Mongoose bumps __v and throws VersionError —
      // surface that as 409 so the client knows to refetch and retry.
      if (err instanceof MongooseError.VersionError) {
        throw new ConflictException(
          `Transaction ${id} was modified by another request. Please refresh and try again.`,
        );
      }
      throw err;
    }
  }

  async getBreakdown(id: string) {
    const tx = await this.findOne(id);
    if (!tx.commissionBreakdown) {
      throw new BadRequestException(
        `Commission breakdown is only available for completed transactions`,
      );
    }
    return {
      transactionId: tx._id,
      propertyAddress: tx.propertyAddress,
      totalServiceFee: tx.totalServiceFee,
      breakdown: tx.commissionBreakdown,
    };
  }

  async remove(id: string): Promise<{ deleted: true; id: string }> {
    const result = await this.transactionModel.findByIdAndDelete(id).exec();
    if (!result) throw new NotFoundException(`Transaction ${id} not found`);
    return { deleted: true, id };
  }
}
