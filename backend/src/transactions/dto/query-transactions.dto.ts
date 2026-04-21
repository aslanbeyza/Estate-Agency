import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { TransactionStage } from '../transaction.schema';

/**
 * Pagination + optional filter contract for `GET /transactions`.
 *
 * Design notes:
 * - **Offset-based, not cursor-based.** Offset is simpler to deep-link
 *   (`?page=3` maps trivially to `offset = (page - 1) * limit`) and the
 *   expected dataset size (mid-hundreds, not millions) doesn't warrant the
 *   cursor complexity. If the collection ever grows past ~50k documents
 *   we can switch to keyset pagination by `createdAt` without breaking
 *   the wire format — the client only reads `hasMore`.
 * - **Hard upper bound on `limit`.** Without it a single request could
 *   still pull the entire collection, defeating the whole point of
 *   pagination. 100 is enough for any realistic dashboard table without
 *   being abusable.
 * - **`@Type(() => Number)`** is required because query-string values
 *   arrive as strings; the validation pipe would otherwise reject
 *   `limit=20` with "must be an integer number".
 */
export class QueryTransactionsDto {
  @ApiPropertyOptional({
    description: 'Maximum number of records to return (1–100).',
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Number of records to skip before returning results.',
    default: 0,
    minimum: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;

  @ApiPropertyOptional({
    description: 'Restrict the result to a single stage.',
    enum: TransactionStage,
  })
  @IsOptional()
  @IsEnum(TransactionStage)
  stage?: TransactionStage;
}

/**
 * Paginated envelope returned by every list endpoint. Generic so other
 * lists (agents, audit log, ...) can reuse the exact same shape — the
 * frontend's `Paginated<T>` type mirrors this one-to-one.
 */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}
