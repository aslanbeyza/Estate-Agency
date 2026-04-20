import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CommissionService } from '../commission/commission.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateStageDto } from './dto/update-stage.dto';
import { Transaction, TransactionDocument, TransactionStage } from './transaction.schema';

const VALID_TRANSITIONS: Partial<Record<TransactionStage, TransactionStage>> = {
  [TransactionStage.AGREEMENT]: TransactionStage.EARNEST_MONEY,
  [TransactionStage.EARNEST_MONEY]: TransactionStage.TITLE_DEED,
  [TransactionStage.TITLE_DEED]: TransactionStage.COMPLETED,
};



@Injectable()
export class TransactionsService {
  constructor(
    @InjectModel(Transaction.name) private transactionModel: Model<TransactionDocument>,
    private commissionService: CommissionService,
  ) {}

  create(dto: CreateTransactionDto): Promise<TransactionDocument> {
    return new this.transactionModel(dto).save();
  }

  findAll(): Promise<TransactionDocument[]> {
    return this.transactionModel
      .find()
      .populate('listingAgent', 'name email')
      .populate('sellingAgent', 'name email')
      .exec();
  }

  async findOne(id: string): Promise<TransactionDocument> {
    const tx = await this.transactionModel
      .findById(id)
      .populate('listingAgent', 'name email')
      .populate('sellingAgent', 'name email')
      .exec();
    if (!tx) throw new NotFoundException(`Transaction ${id} not found`);
    return tx;
  }

  async updateStage(id: string, dto: UpdateStageDto): Promise<TransactionDocument> {
    const tx = await this.transactionModel.findById(id).exec();
    if (!tx) throw new NotFoundException(`Transaction ${id} not found`);

    const allowedNext = VALID_TRANSITIONS[tx.stage];
    if (!allowedNext || allowedNext !== dto.stage) {
      throw new BadRequestException(
        `Invalid stage transition: ${tx.stage} → ${dto.stage}. Expected: ${allowedNext ?? 'none (completed is final)'}`,
      );
    }

    tx.stage = dto.stage;

    if (dto.stage === TransactionStage.COMPLETED) {
      tx.commissionBreakdown = this.commissionService.calculate(
        tx.totalServiceFee,
        tx.listingAgent.toString(),
        tx.sellingAgent.toString(),
      );
    }

    return tx.save();
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
