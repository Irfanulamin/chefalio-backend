import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

/**
 * Reading the caller's session off a request.
 *
 * Three guards need this and each used to do it longhand: pull the token from
 * the `access_token` cookie or a Bearer header, verify it against
 * `process.env.JWT_SECRET`, decide what to do when it does not verify. Three
 * copies meant three chances to disagree — and they did. AlreadyLoggedInGuard
 * read `authorization.split(' ')[1]` without checking the scheme, so it
 * treated the credentials of a `Basic` header as a token.
 *
 * These are plain functions taking the `JwtService` the caller already holds,
 * not an injectable provider. AuthGuard is applied route-scoped in a dozen
 * modules; giving it a new constructor dependency would mean every one of
 * those modules has to be able to resolve it. A function has no such reach.
 */

export interface SessionPayload {
  sub: string;
  role?: string;
  isDemo?: boolean;
  /** Present and equal to 'refresh' on refresh tokens only. */
  type?: string;
  [claim: string]: unknown;
}

/**
 * The token this request is presenting, if any.
 *
 * Cookie first, Bearer header second — that order is deliberate: the cookie is
 * the httpOnly session the browser holds, the header is the fallback for API
 * clients. A non-Bearer scheme is not a token.
 */
export function extractToken(request: Request): string | undefined {
  if (request.cookies?.access_token) {
    return request.cookies.access_token as string;
  }
  const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
  return scheme === 'Bearer' ? token : undefined;
}

/**
 * The verified session, or `null` if there isn't one.
 *
 * "No token" and "token that does not verify" deliberately collapse into the
 * same answer. Only AuthGuard cares about the difference — it wants distinct
 * messages — so it checks for the token itself. The other two guards treat
 * both as simply "not signed in", which is what lets DemoReadOnlyGuard run
 * globally without rejecting anonymous traffic.
 *
 * Note this does *not* reject refresh tokens: a refresh token is a real
 * session, just not one that may call the API. AuthGuard applies that rule;
 * AlreadyLoggedInGuard must not, or a holder of a refresh token would be
 * offered the login page.
 */
export function readSession(
  jwtService: JwtService,
  request: Request,
): SessionPayload | null {
  const token = extractToken(request);
  if (!token) return null;

  try {
    return jwtService.verify<SessionPayload>(token, {
      secret: process.env.JWT_SECRET,
    });
  } catch {
    return null;
  }
}
