import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { SKIP_DEMO_GUARD_KEY } from './skip-demo-guard.decorator';
import { readSession } from './session';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * All three seeded demo accounts (user, chef, admin — see
 * seed-demo-accounts.js) are fully read-only. Their credentials are
 * published in the sign-in UI, so anyone can sign into any of them; letting
 * even the low-privilege ones write would mean a stranger could deface a
 * demo profile, drift a chef's bio, or otherwise leave the shared account
 * in a different state than the next visitor expects.
 *
 * Registered globally (APP_GUARD), which in Nest runs *before* any
 * route-scoped `@UseGuards(AuthGuard)` — so `request.user` isn't populated
 * yet when this runs. It decodes the token itself instead of depending on
 * AuthGuard's ordering, and never throws for a missing/invalid token: that
 * case belongs to AuthGuard (or to routes with no auth at all), not here.
 *
 * `@SkipDemoGuard()` exempts logout/refresh — those manage the session, not
 * app data, and blocking them would trap a demo account in its own login.
 */
@Injectable()
export class DemoReadOnlyGuard implements CanActivate {
  constructor(
    private jwtService: JwtService,
    private reflector: Reflector,
  ) {}

  // Signature kept as Promise<boolean>. readSession is synchronous now, but
  // this guard's public contract is not the place for that detail to leak out.
  // eslint-disable-next-line @typescript-eslint/require-await
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    if (SAFE_METHODS.has(request.method)) {
      return true;
    }

    const skip = this.reflector.getAllAndOverride<boolean>(
      SKIP_DEMO_GUARD_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (skip) {
      return true;
    }

    const payload = readSession(this.jwtService, request);

    if (payload?.isDemo) {
      throw new ForbiddenException('Demo accounts are read-only.');
    }

    return true;
  }
}
