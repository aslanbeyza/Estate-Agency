import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserDocument = User & Document;

export enum UserRole {
  /** Can do everything, including stage transitions and agent CRUD. */
  ADMIN = 'admin',
  /** Can read and create transactions; cannot advance stages or manage agents. */
  AGENT = 'agent',
}

/**
 * The `passwordHash` is intentionally excluded from JSON serialisation. We
 * never want it to leak through `GET /auth/me` or any populate call. Every
 * other security-sensitive field is also stripped unless the service is
 * explicitly holding the raw document for verification.
 */
@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, lowercase: true, trim: true })
  email: string;

  @Prop({ required: true, select: false })
  passwordHash: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, enum: UserRole, default: UserRole.AGENT })
  role: UserRole;

  /**
   * Soft-delete marker, same pattern as `Agent`. A deactivated user cannot
   * log in but historical references (e.g. `Transaction.createdBy`) still
   * resolve, keeping audit trails intact.
   */
  @Prop({ type: Date, default: null })
  deletedAt: Date | null;
}

export const UserSchema = SchemaFactory.createForClass(User);

// Unique email among active users only. Soft-deleted users keep their email
// row, which prevents silent re-use that could confuse the audit trail.
UserSchema.index(
  { email: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);

UserSchema.set('toJSON', {
  transform: (_doc, ret) => {
    const r = ret as unknown as Record<string, unknown>;
    delete r.passwordHash;
    delete r.__v;
    return r;
  },
});
