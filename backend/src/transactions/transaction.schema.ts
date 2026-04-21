import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { CommissionBreakdown } from '../commission/commission.service';

export type TransactionDocument = Transaction & Document;

export enum TransactionStage {
  AGREEMENT = 'agreement',
  EARNEST_MONEY = 'earnest_money',
  TITLE_DEED = 'title_deed',
  COMPLETED = 'completed',
}

/**
 * `optimisticConcurrency: true` makes Mongoose include the current `__v`
 * version key in every `save()` filter. If another write has bumped the
 * document in the meantime the save fails with `VersionError`, which the
 * service layer translates to `409 Conflict`. This closes the race where
 * two clients read the same transaction, both pass the state-machine
 * validation, and then silently overwrite each other's stage transition.
 */
@Schema({ timestamps: true, optimisticConcurrency: true })
export class Transaction {
  @Prop({ required: true })
  propertyAddress: string;

  /**
   * Total service fee stored as **integer kuruş** (1 TRY = 100 kuruş).
   * Keeping money as an integer unit sidesteps IEEE-754 float drift entirely.
   */
  @Prop({
    required: true,
    min: 0,
    validate: {
      validator: Number.isInteger,
      message: 'totalServiceFee must be an integer (kuruş)',
    },
  })
  totalServiceFee: number;

  @Prop({ enum: TransactionStage, default: TransactionStage.AGREEMENT })
  stage: TransactionStage;

  @Prop({ type: Types.ObjectId, ref: 'Agent', required: true })
  listingAgent: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Agent', required: true })
  sellingAgent: Types.ObjectId;

  @Prop({ type: Object })
  commissionBreakdown?: CommissionBreakdown;
}

export const TransactionSchema = SchemaFactory.createForClass(Transaction);
