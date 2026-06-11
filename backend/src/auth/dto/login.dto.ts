import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin', description: 'Usuario administrador' })
  @IsString()
  usuario!: string;

  @ApiProperty({ example: 'dataraiz_admin_2026', description: 'Contraseña' })
  @IsString()
  @MinLength(1)
  password!: string;
}

export class LoginResponseDto {
  @ApiProperty({ description: 'Token JWT (Bearer)' })
  access_token!: string;

  @ApiProperty({ example: 'admin' })
  usuario!: string;

  @ApiProperty({ example: '7d' })
  expires_in!: string;
}
