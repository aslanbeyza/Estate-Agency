import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsMongoId, IsNotEmpty, IsString, Min } from 'class-validator';

export class CreateTransactionDto {
  @ApiProperty({ example: 'Moda Mah. Örnek Sok. No:10, Kadıköy/İstanbul' })
  @IsString()
  @IsNotEmpty()
  propertyAddress: string;

  @ApiProperty({
    example: 15000000,
    minimum: 0,
    description:
      'Total service fee in kuruş (1 TRY = 100 kuruş). Must be a non-negative integer. Example: 15000000 = ₺150.000,00',
  })
  @IsInt()
  @Min(0)
  totalServiceFee: number;

  @ApiProperty({
    example: '65f1a3b2c4d5e6f7a8b9c0d1',
    description: 'Listing agent Mongo ObjectId',
  })
  @IsMongoId()
  listingAgent: string;

  @ApiProperty({
    example: '65f1a3b2c4d5e6f7a8b9c0d2',
    description: 'Selling agent Mongo ObjectId',
  })
  @IsMongoId()
  sellingAgent: string;
}
