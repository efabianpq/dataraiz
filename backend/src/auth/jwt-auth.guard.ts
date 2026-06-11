import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Guard que exige un Bearer token JWT válido. */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}

/** Constante del usuario admin del MVP (id en tabla `usuario`). */
export const ADMIN_USER_ID = 1;
