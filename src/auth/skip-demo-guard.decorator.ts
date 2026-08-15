import { SetMetadata } from '@nestjs/common';

export const SKIP_DEMO_GUARD_KEY = 'skipDemoGuard';

/**
 * Exempts a route from DemoReadOnlyGuard — for session-lifecycle endpoints
 * (logout, refresh) that must keep working for a demo account even though
 * every other write is blocked. Being read-only means you can't mutate app
 * data, not that you're trapped in the session.
 */
export const SkipDemoGuard = () => SetMetadata(SKIP_DEMO_GUARD_KEY, true);
