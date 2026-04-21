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

  /**
   * Who created this transaction. Points at the authenticated user at
   * the time of creation. Never overwritten — if the user is later
   * soft-deleted, the reference still resolves (same rationale as Agent
   * soft-delete) so audit queries keep working.
   */
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;

  /**
   * Append-only audit trail: one entry per stage transition, including
   * the initial `agreement` stamped at create time. Answers the "who
   * approved this transaction?" question directly without a separate
   * audit-log collection. Embedded because it is strictly per-transaction
   * and the stage machine has at most 4 entries.
   */
  @Prop({
    type: [
      {
        stage: { type: String, enum: TransactionStage, required: true },
        at: { type: Date, required: true },
        by: { type: Types.ObjectId, ref: 'User', required: true },
        _id: false,
      },
    ],
    default: [],
  })
  stageHistory: Array<{
    stage: TransactionStage;
    at: Date;
    by: Types.ObjectId;
  }>;
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

/**
 * Index strategy.
 *
 * Rather than sprinkling `@Prop({ index: true })` on every field, the
 * indexes below are **designed against the actual query shapes** the
 * service layer emits (see `TransactionsService.findPaginated`,
 * `AgentsService.earnings` and the agent transactions view). Each
 * follows the classic MongoDB **ESR rule** — Equality prefix, then
 * Sort, then Range — so the same index can both filter *and* satisfy
 * the sort without an in-memory phase.
 *
 * Trade-off: every index adds cost on insert/update. In this workload
 * writes are infrequent (a handful of transactions a day per office)
 * and reads dominate (a dashboard opened continuously), so paying ~4
 * extra index writes per insert to avoid collection scans at read
 * time is clearly the right call.
 */

// 1. Paginated list without a stage filter.
//    Query: find({}).sort({ createdAt: -1, _id: -1 }).skip().limit()
//    Pure sort-only; the _id tiebreaker is included so the compound
//    index fully covers both the sort direction and the secondary key.
TransactionSchema.index({ createdAt: -1, _id: -1 });

// 2. Paginated list + counts filtered by stage.
//    Query: find({ stage }).sort({ createdAt: -1 }).skip().limit()
//           countDocuments({ stage })
//    ESR: equality on `stage`, then sort on `createdAt`. This is the
//    index that kicks in the moment a user clicks a stage chip.
TransactionSchema.index({ stage: 1, createdAt: -1, _id: -1 });

// 3. Agent-lens queries (earnings + `/agents/:id/transactions`).
//    Queries:
//      find({ stage: COMPLETED, $or: [{ listingAgent }, { sellingAgent }] })
//      find({ $or: [{ listingAgent }, { sellingAgent }] })
//    MongoDB resolves `$or` as an index union — one plan per branch —
//    so we need **one index per agent side**. Putting `stage` second
//    lets the same index serve the COMPLETED-only earnings path
//    efficiently (ESR again).
TransactionSchema.index({ listingAgent: 1, stage: 1, createdAt: -1 });
TransactionSchema.index({ sellingAgent: 1, stage: 1, createdAt: -1 });
