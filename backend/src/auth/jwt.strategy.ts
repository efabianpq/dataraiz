import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

export interface JwtPayload {
  /** id del usuario en la tabla `usuario` (admin = 1) */
  sub: number;
  usuario: string;
}

/**
 * Valida el Bearer token. El secreto es JWT_SECRET. El payload identifica al
 * usuario admin (sub=1), que es el dueño de watchlist y alertas en el MVP.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET ?? 'dataraiz_jwt_secret_dev_only',
    });
  }

  validate(payload: JwtPayload): JwtPayload {
    return { sub: payload.sub, usuario: payload.usuario };
  }
}
