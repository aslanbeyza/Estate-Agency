import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AgentDocument = Agent & Document;

@Schema({ timestamps: true })
export class Agent {
  @Prop({ required: true })
  name: string;

  /**
   * Email is the natural unique key for agents. When an agent is soft-deleted
   * we intentionally keep the row (for historical populate), so email
   * uniqueness is scoped to live rows only — see the partial index below.
   */
  @Prop({ required: true })
  email: string;

  @Prop()
  phone?: string;

  /**
   * Soft-delete marker. `null` = active. Set on DELETE instead of removing
   * the document, so existing transactions that reference this agent via
   * `ObjectId` can still resolve their populate('listingAgent' | 'sellingAgent')
   * lookups and render historical data without dangling-ref errors.
   *
   * Active-listing queries (`findAll`) filter this out; history queries
   * (`findOne`, populate) intentionally do not.
   */
  @Prop({ type: Date, default: null })
  deletedAt: Date | null;
}

export const AgentSchema = SchemaFactory.createForClass(Agent);

// Email uniqueness only applies to live agents. A soft-deleted agent keeps its
// row but frees up the email for a new signup.
AgentSchema.index(
  { email: 1 },
  {
    unique: true,
    partialFilterExpression: { deletedAt: null },
  },
);
