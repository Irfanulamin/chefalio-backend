import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class GoogleOAuthGuard extends AuthGuard('google') {
  handleRequest<TUser = any>(
    err: any,
    user: any,
    _info: any,
    _context: ExecutionContext,
  ): TUser {
    // Return null instead of throwing so the controller can redirect gracefully.
    if (err || !user) return null as unknown as TUser;
    return user;
  }
}
