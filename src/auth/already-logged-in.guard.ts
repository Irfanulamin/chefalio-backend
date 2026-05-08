import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

@Injectable()
export class AlreadyLoggedInGuard implements CanActivate {
  constructor(private jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    const token =
      request.cookies?.access_token ??
      request.headers.authorization?.split(' ')[1];

    if (!token) return true;

    try {
      this.jwtService.verify(token, { secret: process.env.JWT_SECRET });
      throw new ForbiddenException('Already authenticated');
    } catch (err) {
      if (err instanceof ForbiddenException) throw err;
      // Expired or invalid token — let the request through
      return true;
    }
  }
}
