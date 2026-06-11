import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ADMIN_USER_ID } from './jwt-auth.guard';
import { LoginResponseDto } from './dto/login.dto';

const ADMIN_USER = 'admin';

@Injectable()
export class AuthService {
  constructor(private readonly jwt: JwtService) {}

  login(usuario: string, password: string): LoginResponseDto {
    const expected = process.env.ADMIN_PASSWORD ?? 'dataraiz_admin_2026';
    if (usuario !== ADMIN_USER || password !== expected) {
      throw new UnauthorizedException('Credenciales inválidas');
    }
    const access_token = this.jwt.sign({ sub: ADMIN_USER_ID, usuario });
    return {
      access_token,
      usuario,
      expires_in: process.env.JWT_EXPIRES_IN ?? '7d',
    };
  }
}
