import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId, IsNotEmpty, IsNumber, IsString, Min } from 'class-validator';

export class CreateTransactionDto {
  @ApiProperty({ example: 'Moda Mah. Örnek Sok. No:10, Kadıköy/İstanbul' })
  @IsString()
  @IsNotEmpty()
  propertyAddress: string;

  @ApiProperty({ example: 150000, minimum: 0, description: 'Total service fee (commission base)' })
  @IsNumber()
  @Min(0)
  totalServiceFee: number;

  @ApiProperty({ example: '65f1a3b2c4d5e6f7a8b9c0d1', description: 'Listing agent Mongo ObjectId' })
  @IsMongoId()
  listingAgent: string;

  @ApiProperty({ example: '65f1a3b2c4d5e6f7a8b9c0d2', description: 'Selling agent Mongo ObjectId' })
  @IsMongoId()
  sellingAgent: string;
}
