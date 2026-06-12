import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { ADMIN_USER_ID } from './jwt-auth.guard';

describe('AuthService', () => {
  let service: AuthService;
  let jwt: { sign: jest.Mock };

  beforeEach(async () => {
    jwt = { sign: jest.fn().mockReturnValue('signed.jwt.token') };
    const module: TestingModule = await Test.createTestingModule({
      providers: [AuthService, { provide: JwtService, useValue: jwt }],
    }).compile();
    service = module.get(AuthService);
    process.env.ADMIN_PASSWORD = 'secreto';
  });

  it('emite un token para credenciales válidas con sub=ADMIN_USER_ID', () => {
    const res = service.login('admin', 'secreto');
    expect(res.access_token).toBe('signed.jwt.token');
    expect(res.usuario).toBe('admin');
    expect(jwt.sign).toHaveBeenCalledWith({
      sub: ADMIN_USER_ID,
      usuario: 'admin',
    });
  });

  it('rechaza una contraseña incorrecta', () => {
    expect(() => service.login('admin', 'mala')).toThrow(UnauthorizedException);
  });

  it('rechaza un usuario distinto de admin', () => {
    expect(() => service.login('otro', 'secreto')).toThrow(
      UnauthorizedException,
    );
  });
});
