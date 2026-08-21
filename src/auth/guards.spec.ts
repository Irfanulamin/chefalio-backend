import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AuthGuard } from './auth.guard';
import { DemoReadOnlyGuard } from './demo-read-only.guard';
import { AlreadyLoggedInGuard } from './already-logged-in.guard';

/**
 * Characterization tests for the guard trio.
 *
 * These were written against the guards *as they already behaved*, before the
 * shared session seam was extracted, precisely so the refactor could not
 * quietly change who gets in. Every expectation here is a fact about the old
 * implementation; if one of them changes, the refactor broke something real.
 *
 * The interesting cases are the disagreements between the three guards, which
 * is where a careless "cleanup" does damage:
 *   - AuthGuard rejects refresh tokens; AlreadyLoggedInGuard must not care.
 *   - DemoReadOnlyGuard must never reject a bad token — that is AuthGuard's
 *     job, and this one runs globally, on unauthenticated routes too.
 */
const SECRET = 'test-jwt-secret';

describe('auth guards', () => {
  const jwt = new JwtService({ secret: SECRET });
  let reflector: Reflector;

  beforeAll(() => {
    process.env.JWT_SECRET = SECRET;
  });

  beforeEach(() => {
    reflector = new Reflector();
  });

  const sign = (payload: object) => jwt.sign(payload, { secret: SECRET });
  const foreign = (payload: object) =>
    jwt.sign(payload, { secret: 'not-our-secret' });

  function ctx(req: Record<string, unknown>): ExecutionContext {
    return {
      switchToHttp: () => ({ getRequest: () => req }),
      getHandler: () => function handler() {},
      getClass: () => class Controller {},
    } as unknown as ExecutionContext;
  }

  const withCookie = (token: string, method = 'POST') => ({
    method,
    cookies: { access_token: token },
    headers: {},
  });
  const withBearer = (token: string, method = 'POST') => ({
    method,
    cookies: {},
    headers: { authorization: `Bearer ${token}` },
  });

  describe('AuthGuard', () => {
    const guard = () => new AuthGuard(jwt);

    it('accepts a cookie token and populates request.user', async () => {
      const req = withCookie(sign({ sub: 'u1', role: 'chef' }));
      await expect(guard().canActivate(ctx(req))).resolves.toBe(true);
      expect((req as Record<string, any>).user).toMatchObject({
        sub: 'u1',
        role: 'chef',
      });
    });

    it('accepts a Bearer token as a fallback', async () => {
      const req = withBearer(sign({ sub: 'u2', role: 'user' }));
      await expect(guard().canActivate(ctx(req))).resolves.toBe(true);
      expect((req as Record<string, any>).user).toMatchObject({ sub: 'u2' });
    });

    it('prefers the cookie when both are present', async () => {
      const req = {
        method: 'POST',
        cookies: { access_token: sign({ sub: 'cookie' }) },
        headers: { authorization: `Bearer ${sign({ sub: 'header' })}` },
      };
      await guard().canActivate(ctx(req));
      expect((req as Record<string, any>).user.sub).toBe('cookie');
    });

    it('rejects a request with no token', async () => {
      await expect(
        guard().canActivate(ctx({ method: 'POST', cookies: {}, headers: {} })),
      ).rejects.toThrow('Token not found');
    });

    it('rejects a token signed with the wrong secret', async () => {
      await expect(
        guard().canActivate(ctx(withCookie(foreign({ sub: 'x' })))),
      ).rejects.toThrow('Invalid token');
    });

    it('rejects a refresh token used as an access token', async () => {
      const refresh = sign({ sub: 'u1', type: 'refresh' });
      await expect(
        guard().canActivate(ctx(withCookie(refresh))),
      ).rejects.toThrow('Invalid token');
    });

    it('ignores a non-Bearer authorization scheme', async () => {
      await expect(
        guard().canActivate(
          ctx({
            method: 'POST',
            cookies: {},
            headers: { authorization: 'Basic abc' },
          }),
        ),
      ).rejects.toThrow('Token not found');
    });
  });

  describe('DemoReadOnlyGuard', () => {
    const guard = () => new DemoReadOnlyGuard(jwt, reflector);
    const demo = () => sign({ sub: 'd', isDemo: true });

    it.each(['GET', 'HEAD', 'OPTIONS'])(
      'lets a demo account through on %s',
      async (method) => {
        const req = withCookie(demo(), method);
        await expect(guard().canActivate(ctx(req))).resolves.toBe(true);
      },
    );

    it.each(['POST', 'PATCH', 'PUT', 'DELETE'])(
      'blocks a demo account on %s',
      async (method) => {
        const req = withCookie(demo(), method);
        await expect(guard().canActivate(ctx(req))).rejects.toBeInstanceOf(
          ForbiddenException,
        );
      },
    );

    it('lets a real account write', async () => {
      const req = withCookie(sign({ sub: 'r', isDemo: false }));
      await expect(guard().canActivate(ctx(req))).resolves.toBe(true);
    });

    it('lets a token with no isDemo claim write', async () => {
      const req = withCookie(sign({ sub: 'r' }));
      await expect(guard().canActivate(ctx(req))).resolves.toBe(true);
    });

    it('passes an unauthenticated request through — not its job to reject', async () => {
      await expect(
        guard().canActivate(ctx({ method: 'POST', cookies: {}, headers: {} })),
      ).resolves.toBe(true);
    });

    it('passes an invalid token through — that belongs to AuthGuard', async () => {
      const req = withCookie(foreign({ sub: 'x', isDemo: true }));
      await expect(guard().canActivate(ctx(req))).resolves.toBe(true);
    });

    it('honours @SkipDemoGuard', async () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
      const req = withCookie(demo());
      await expect(guard().canActivate(ctx(req))).resolves.toBe(true);
    });

    it('blocks a demo account arriving by Bearer header too', async () => {
      const req = withBearer(demo());
      await expect(guard().canActivate(ctx(req))).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('AlreadyLoggedInGuard', () => {
    const guard = () => new AlreadyLoggedInGuard(jwt);

    it('blocks a caller holding a valid token', () => {
      expect(() =>
        guard().canActivate(ctx(withCookie(sign({ sub: 'u' })))),
      ).toThrow('Already authenticated');
    });

    it('lets an anonymous caller through', () => {
      expect(
        guard().canActivate(ctx({ method: 'POST', cookies: {}, headers: {} })),
      ).toBe(true);
    });

    it('lets a caller with an invalid token through', () => {
      expect(guard().canActivate(ctx(withCookie(foreign({ sub: 'x' }))))).toBe(
        true,
      );
    });

    it('treats a refresh token as being logged in', () => {
      // Unlike AuthGuard, this guard does not care about token type: someone
      // holding a refresh token is still logged in and should not see /login.
      expect(() =>
        guard().canActivate(
          ctx(withCookie(sign({ sub: 'u', type: 'refresh' }))),
        ),
      ).toThrow('Already authenticated');
    });
  });
});
