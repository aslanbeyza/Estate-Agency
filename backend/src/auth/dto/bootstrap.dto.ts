import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

/**
 * One-shot payload for creating the very first admin user when the
 * database is empty. Same fields as a login plus a name; role is always
 * forced to `admin` server-side so the endpoint can't be used to grant
 * privileges afterwards.
 */
export class BootstrapAdminDto {
  @ApiProperty({ example: 'admin@estate.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'changeme' })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ example: 'Yönetici' })
  @IsString()
  name: string;
}
