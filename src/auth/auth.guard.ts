import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { extractToken, readSession, SessionPayload } from './session';

/**
 * Route-scoped. Requires a valid *access* token and puts its payload on
 * `request.user` for RolesGuard and the controllers to read.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private jwtService: JwtService) {}

  // Kept async, as it always was. Nest awaits either shape, but the signature
  // is part of this guard's contract and a refactor is not the place to
  // change it.
  // Signature kept as Promise<boolean>. readSession is synchronous now, but
  // this guard's public contract is not the place for that detail to leak out.
  // eslint-disable-next-line @typescript-eslint/require-await
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    // Checked separately from readSession so "you sent nothing" and "you sent
    // something invalid" stay distinguishable to the caller.
    if (!extractToken(request)) {
      throw new UnauthorizedException('Token not found');
    }

    const payload = readSession(this.jwtService, request);

    // A refresh token verifies fine — it just isn't a key to the API.
    if (!payload || payload.type === 'refresh') {
      throw new UnauthorizedException('Invalid token');
    }

    // Express's Request['user'] is augmented to Passport's User elsewhere in
    // the tree; the raw JWT payload is what every controller here reads.
    (request as unknown as { user: SessionPayload }).user = payload;
    return true;
  }
}
