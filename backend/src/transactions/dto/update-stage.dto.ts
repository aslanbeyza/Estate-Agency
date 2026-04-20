import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { TransactionStage } from '../transaction.schema';

export class UpdateStageDto {
  @ApiProperty({
    enum: TransactionStage,
    description: 'Target stage (must be the next stage in the pipeline)',
    example: TransactionStage.EARNEST_MONEY,
  })
  @IsEnum(TransactionStage)
  stage: TransactionStage;
}
