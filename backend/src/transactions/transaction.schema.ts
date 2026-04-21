import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, HydratedDocument, Types } from 'mongoose';
import { CommissionBreakdown } from '../commission/commission.service';

export type TransactionDocument = Transaction & Document;

/**
 * Resolves the id of an agent reference regardless of whether the field is
 * still a raw ObjectId or has been populated into an Agent document. Kept
 * local to the virtual below because this is the only place that needs it.
 */
function refId(ref: unknown): string | null {
  if (!ref) return null;
  if (ref instanceof Types.ObjectId) return ref.toString();
  if (typeof ref === 'string') return ref;
  if (typeof ref === 'object' && ref !== null && '_id' in ref) {
    const inner = (ref as { _id: unknown })._id;
    if (!inner) return null;
    if (inner instanceof Types.ObjectId) return inner.toString();
    if (typeof inner === 'string') return inner;
    return null;
  }
  return null;
}

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

/**
 * Derived flags exposed to the API so the frontend never has to re-implement
 * business rules. They live as Mongoose virtuals so every endpoint that
 * returns a transaction ships them automatically, and there is a single
 * source of truth for "what counts as payout-ready" and "is this the
 * same-agent scenario".
 */
TransactionSchema.virtual('isPayoutReady').get(function (
  this: HydratedDocument<Transaction>,
) {
  return (
    this.stage === TransactionStage.COMPLETED && !!this.commissionBreakdown
  );
});

TransactionSchema.virtual('isSameAgent').get(function (
  this: HydratedDocument<Transaction>,
) {
  const l = refId(this.listingAgent);
  const s = refId(this.sellingAgent);
  return !!l && !!s && l === s;
});

// Serialise virtuals on every JSON response and keep the string `id` helper
// Mongoose already gives us. `versionKey: false` hides __v from the wire —
// it still exists in the DB and drives optimistic concurrency.
TransactionSchema.set('toJSON', { virtuals: true, versionKey: false });
TransactionSchema.set('toObject', { virtuals: true });
