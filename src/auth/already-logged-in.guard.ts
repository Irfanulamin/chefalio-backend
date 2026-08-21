import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { readSession } from './session';

/**
 * Route-scoped, on login/register. Someone already holding a session has no
 * business creating another one.
 *
 * Any verifiable token counts, refresh tokens included — unlike AuthGuard,
 * this guard is asking "are you signed in?", not "may you call the API?".
 */
@Injectable()
export class AlreadyLoggedInGuard implements CanActivate {
  constructor(private jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    if (readSession(this.jwtService, request)) {
      throw new ForbiddenException('Already authenticated');
    }

    // No token, or one that does not verify: an expired session should still
    // be able to reach the login page.
    return true;
  }
}
