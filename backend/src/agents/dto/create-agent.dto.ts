import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateAgentDto {
  @ApiProperty({ example: 'Ayşe Yılmaz' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'ayse@agency.com' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ example: '+905551112233' })
  @IsString()
  @IsOptional()
  phone?: string;
}
