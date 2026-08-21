import type { Model } from 'mongoose';
import type { User } from '../user/schema/user.schema';

/**
 * Who and what the public catalogue is allowed to show.
 *
 * Seeded demo accounts (`isDemo: true`, see `src/seeds/seed-demo-accounts.js`)
 * publish real recipes and cookbooks so a reviewer signing in to the demo has
 * a populated dashboard. None of that content belongs in the catalogue a real
 * visitor browses, and the demo chefs don't belong in the chef directory.
 *
 * That rule used to be written out longhand in three separate services, which
 * is how `/chefs/count` ended up counting chefs that `/chefs` would never list.
 */

/** Active, non-demo chefs — the chef directory and its headline count. */
export function publicChefFilter(): Record<string, any> {
  return { role: 'chef', isActive: true, isDemo: { $ne: true } };
}

/**
 * A filter fragment that hides content written by demo accounts.
 *
 * Spread it into a query rather than assigning it, so it composes with
 * whatever else the caller is filtering on:
 *
 * ```ts
 * const filter = { difficulty, ...(await hideDemoAuthors(this.userModel)) };
 * ```
 *
 * Returns `{}` when there are no demo accounts, so the spread is a no-op
 * rather than an `$nin: []` that every document has to be checked against.
 */
export async function hideDemoAuthors(
  userModel: Model<User>,
): Promise<Record<string, any>> {
  const demoAuthors = await userModel.find({ isDemo: true }).select('_id');
  if (!demoAuthors.length) return {};
  return {
    authorId: { $nin: demoAuthors.map((u) => u._id) },
  };
}
