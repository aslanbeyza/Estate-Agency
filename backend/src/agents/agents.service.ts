import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Agent, AgentDocument } from './agent.schema';
import { CreateAgentDto } from './dto/create-agent.dto';
import {
  Transaction,
  TransactionDocument,
  TransactionStage,
} from '../transactions/transaction.schema';
import { CommissionBreakdown } from '../commission/commission.service';

/**
 * All monetary fields are integer kuruş (1 TRY = 100 kuruş).
 */
export interface AgentEarningsReport {
  agentId: string;
  name: string;
  email: string;
  totalEarned: number;
  completedTransactionCount: number;
  asListingAgent: number;
  asSellingAgent: number;
}

/**
 * List-level aggregate for the "agents" page. Bundles every counter the UI
 * needs so the client never has to iterate over the transactions collection
 * to derive totals. All money fields are integer kuruş.
 */
export interface AgentStats {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  deletedAt: Date | null;
  listingCount: number;
  sellingCount: number;
  completedCount: number;
  totalEarned: number;
}

export type AgentRoleInTransaction = 'listing' | 'selling' | 'both';

/**
 * Agent-lens view of a transaction: the server embeds the role and the
 * agent's share so the UI just renders. `amount` is `null` whenever the
 * transaction hasn't been paid out yet (i.e. `isPayoutReady === false`).
 */
export interface AgentTransactionView {
  _id: string;
  propertyAddress: string;
  totalServiceFee: number;
  stage: TransactionStage;
  createdAt: Date;
  listingAgent: AgentRefView;
  sellingAgent: AgentRefView;
  isPayoutReady: boolean;
  isSameAgent: boolean;
  role: AgentRoleInTransaction;
  amount: number | null;
}

interface AgentRefView {
  _id: string;
  name: string;
  email: string;
  deletedAt: Date | null;
}

@Injectable()
export class AgentsService {
  constructor(
    @InjectModel(Agent.name) private agentModel: Model<AgentDocument>,
    @InjectModel(Transaction.name)
    private transactionModel: Model<TransactionDocument>,
  ) {}

  create(dto: CreateAgentDto): Promise<AgentDocument> {
    return new this.agentModel(dto).save();
  }

  /**
   * Lists only **active** agents. Soft-deleted rows are hidden from the
   * public-facing roster, but remain resolvable via `findOne` / populate so
   * historical transactions stay intact.
   */
  findAll(): Promise<AgentDocument[]> {
    return this.agentModel
      .find({ deletedAt: null })
      .sort({ createdAt: -1 })
      .exec();
  }

  /**
   * Fetches any agent by id — including soft-deleted ones — on purpose.
   * This endpoint backs the detail view and the earnings aggregation; both
   * need to work for deleted agents so we can display their history.
   */
  async findOne(id: string): Promise<AgentDocument> {
    const agent = await this.agentModel.findById(id).exec();
    if (!agent) throw new NotFoundException(`Agent ${id} not found`);
    return agent;
  }

  /**
   * Soft-delete. We keep the row (and its ObjectId) so that every transaction
   * that still references this agent via `listingAgent` / `sellingAgent` can
   * resolve its populate lookup and render without dangling-ref errors.
   *
   * Idempotent: re-deleting an already soft-deleted agent returns the same
   * receipt rather than throwing, which matches DELETE semantics.
   */
  async remove(id: string): Promise<{ deleted: true; id: string }> {
    const agent = await this.agentModel.findById(id).exec();
    if (!agent) throw new NotFoundException(`Agent ${id} not found`);

    if (agent.deletedAt === null) {
      agent.deletedAt = new Date();
      await agent.save();
    }

    return { deleted: true, id };
  }

  /**
   * Aggregates completed transactions for a given agent and returns the total
   * amount they have earned, split by role (listing vs selling).
   */
  async earnings(id: string): Promise<AgentEarningsReport> {
    const agent = await this.findOne(id);
    const agentObjectId = new Types.ObjectId(id);

    const completed = await this.transactionModel
      .find({
        stage: TransactionStage.COMPLETED,
        $or: [{ listingAgent: agentObjectId }, { sellingAgent: agentObjectId }],
      })
      .lean()
      .exec();

    let asListingAgent = 0;
    let asSellingAgent = 0;

    for (const tx of completed) {
      const breakdown = tx.commissionBreakdown;
      if (!breakdown) continue;
      if (String(tx.listingAgent) === id)
        asListingAgent += breakdown.listingAgentAmount;
      if (String(tx.sellingAgent) === id)
        asSellingAgent += breakdown.sellingAgentAmount;
    }

    return {
      agentId: String(agent._id),
      name: agent.name,
      email: agent.email,
      totalEarned: asListingAgent + asSellingAgent,
      completedTransactionCount: completed.length,
      asListingAgent,
      asSellingAgent,
    };
  }

  /**
   * List-level stats for the agents page. A single aggregation pipeline
   * joins active agents with their transactions and computes listing /
   * selling / completed counts plus total earnings (integer kuruş). The
   * frontend uses the result as-is — no business rules leak into the UI.
   */
  async stats(): Promise<AgentStats[]> {
    return this.agentModel
      .aggregate<AgentStats>([
        { $match: { deletedAt: null } },
        { $sort: { createdAt: -1 } },
        {
          $lookup: {
            from: 'transactions',
            let: { agentId: '$_id' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $or: [
                      {
                        $eq: [
                          { $toString: '$listingAgent' },
                          { $toString: '$$agentId' },
                        ],
                      },
                      {
                        $eq: [
                          { $toString: '$sellingAgent' },
                          { $toString: '$$agentId' },
                        ],
                      },
                    ],
                  },
                },
              },
              {
                $project: {
                  stage: 1,
                  listingAgent: 1,
                  sellingAgent: 1,
                  commissionBreakdown: 1,
                },
              },
            ],
            as: 'txs',
          },
        },
        {
          $addFields: {
            listingCount: {
              $size: {
                $filter: {
                  input: '$txs',
                  as: 't',
                  cond: {
                    $eq: [
                      { $toString: '$$t.listingAgent' },
                      { $toString: '$_id' },
                    ],
                  },
                },
              },
            },
            sellingCount: {
              $size: {
                $filter: {
                  input: '$txs',
                  as: 't',
                  cond: {
                    $eq: [
                      { $toString: '$$t.sellingAgent' },
                      { $toString: '$_id' },
                    ],
                  },
                },
              },
            },
            completedTxs: {
              $filter: {
                input: '$txs',
                as: 't',
                cond: {
                  $and: [
                    { $eq: ['$$t.stage', TransactionStage.COMPLETED] },
                    { $ne: ['$$t.commissionBreakdown', null] },
                  ],
                },
              },
            },
          },
        },
        {
          $addFields: {
            completedCount: { $size: '$completedTxs' },
            totalEarned: {
              $sum: {
                $map: {
                  input: '$completedTxs',
                  as: 't',
                  in: {
                    $add: [
                      {
                        $cond: [
                          {
                            $eq: [
                              { $toString: '$$t.listingAgent' },
                              { $toString: '$_id' },
                            ],
                          },
                          '$$t.commissionBreakdown.listingAgentAmount',
                          0,
                        ],
                      },
                      {
                        $cond: [
                          {
                            $eq: [
                              { $toString: '$$t.sellingAgent' },
                              { $toString: '$_id' },
                            ],
                          },
                          '$$t.commissionBreakdown.sellingAgentAmount',
                          0,
                        ],
                      },
                    ],
                  },
                },
              },
            },
          },
        },
        {
          $project: {
            _id: 1,
            name: 1,
            email: 1,
            phone: 1,
            deletedAt: 1,
            listingCount: 1,
            sellingCount: 1,
            completedCount: 1,
            totalEarned: 1,
          },
        },
      ])
      .exec();
  }

  /**
   * Agent-lens transaction feed. Returns every transaction the given agent
   * participates in, pre-projected with the role and the agent's own share.
   * Existence is validated up front so a soft-deleted-but-historical agent
   * still gets their history (matches `findOne` semantics).
   */
  async transactions(id: string): Promise<AgentTransactionView[]> {
    const agent = await this.findOne(id);
    const agentId = String(agent._id);

    // Match `stats()` $lookup semantics: compare via $toString so we stay
    // consistent if stored refs ever differ in BSON shape from a plain ObjectId query.
    const txs = await this.transactionModel
      .find({
        $or: [
          { $expr: { $eq: [{ $toString: '$listingAgent' }, agentId] } },
          { $expr: { $eq: [{ $toString: '$sellingAgent' }, agentId] } },
        ],
      })
      .populate('listingAgent', 'name email deletedAt')
      .populate('sellingAgent', 'name email deletedAt')
      .sort({ createdAt: -1 })
      .exec();

    return txs.map((tx) => this.toAgentView(tx, agentId));
  }

  private toAgentView(
    tx: TransactionDocument,
    agentId: string,
  ): AgentTransactionView {
    const listing = toAgentRef(tx.listingAgent);
    const selling = toAgentRef(tx.sellingAgent);
    const isListing = listing._id === agentId;
    const isSelling = selling._id === agentId;

    const role: AgentRoleInTransaction =
      isListing && isSelling ? 'both' : isListing ? 'listing' : 'selling';

    const amount = amountForRole(tx.commissionBreakdown, role);

    return {
      _id: String(tx._id),
      propertyAddress: tx.propertyAddress,
      totalServiceFee: tx.totalServiceFee,
      stage: tx.stage,
      createdAt: (tx as unknown as { createdAt: Date }).createdAt,
      listingAgent: listing,
      sellingAgent: selling,
      // Virtuals are available on the hydrated document but casting keeps TS quiet.
      isPayoutReady: (tx as unknown as { isPayoutReady: boolean })
        .isPayoutReady,
      isSameAgent: (tx as unknown as { isSameAgent: boolean }).isSameAgent,
      role,
      amount,
    };
  }
}

function toAgentRef(ref: unknown): AgentRefView {
  if (
    ref &&
    typeof ref === 'object' &&
    'name' in (ref as Record<string, unknown>)
  ) {
    const a = ref as {
      _id: unknown;
      name: string;
      email: string;
      deletedAt?: Date | null;
    };
    return {
      _id: String(a._id),
      name: a.name,
      email: a.email,
      deletedAt: a.deletedAt ?? null,
    };
  }
  // Unpopulated ObjectId — keep the shape consistent for the client.
  return { _id: String(ref), name: '', email: '', deletedAt: null };
}

function amountForRole(
  breakdown: CommissionBreakdown | undefined,
  role: AgentRoleInTransaction,
): number | null {
  if (!breakdown) return null;
  // Same-agent scenario: backend puts the entire agent pool on
  // listingAgentAmount and zeroes sellingAgentAmount. Honour that here.
  if (role === 'selling') return breakdown.sellingAgentAmount;
  return breakdown.listingAgentAmount;
}
