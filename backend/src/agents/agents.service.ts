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

  findAll(): Promise<AgentDocument[]> {
    return this.agentModel.find().sort({ createdAt: -1 }).exec();
  }

  async findOne(id: string): Promise<AgentDocument> {
    const agent = await this.agentModel.findById(id).exec();
    if (!agent) throw new NotFoundException(`Agent ${id} not found`);
    return agent;
  }

  async remove(id: string): Promise<{ deleted: true; id: string }> {
    const result = await this.agentModel.findByIdAndDelete(id).exec();
    if (!result) throw new NotFoundException(`Agent ${id} not found`);
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
}
