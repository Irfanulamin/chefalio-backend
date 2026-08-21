import { Types } from 'mongoose';
import type { Model } from 'mongoose';
import type { User } from '../user/schema/user.schema';
import { hideDemoAuthors, publicChefFilter } from './demo-visibility';

/**
 * Seeded demo accounts publish real content so the reviewer's own dashboard
 * has something in it. None of it belongs in a catalogue a visitor browses.
 *
 * The rule was written out longhand in three services. What these tests pin
 * down is the shape of the filter fragment, so the callers can spread it in
 * and stay honest about what "public" means.
 */
describe('demo visibility', () => {
  const ids = [new Types.ObjectId(), new Types.ObjectId()];

  function userModel(demoIds: Types.ObjectId[]) {
    const calls: Record<string, unknown>[] = [];
    const model = {
      find: (filter: Record<string, unknown>) => {
        calls.push(filter);
        return {
          select: () => Promise.resolve(demoIds.map((_id) => ({ _id }))),
        };
      },
    };
    return { model: model as unknown as Model<User>, calls };
  }

  describe('hideDemoAuthors', () => {
    it('excludes every demo author it finds', async () => {
      const { model } = userModel(ids);
      await expect(hideDemoAuthors(model)).resolves.toEqual({
        authorId: { $nin: ids },
      });
    });

    it('asks only for demo users', async () => {
      const { model, calls } = userModel(ids);
      await hideDemoAuthors(model);
      expect(calls).toEqual([{ isDemo: true }]);
    });

    it('is an empty fragment when there are no demo accounts', async () => {
      const { model } = userModel([]);
      await expect(hideDemoAuthors(model)).resolves.toEqual({});
    });

    it('spreads into a filter without adding keys when empty', async () => {
      const { model } = userModel([]);
      const filter = { difficulty: 'easy', ...(await hideDemoAuthors(model)) };
      expect(Object.keys(filter)).toEqual(['difficulty']);
    });

    it('does not clobber the rest of the filter', async () => {
      const { model } = userModel(ids);
      const filter = { difficulty: 'easy', ...(await hideDemoAuthors(model)) };
      expect(filter).toEqual({
        difficulty: 'easy',
        authorId: { $nin: ids },
      });
    });
  });

  describe('publicChefFilter', () => {
    it('is active, non-demo chefs', () => {
      expect(publicChefFilter()).toEqual({
        role: 'chef',
        isActive: true,
        isDemo: { $ne: true },
      });
    });

    it('returns a fresh object each call, so callers can mutate it', () => {
      const a = publicChefFilter();
      a.search = 'x';
      expect(publicChefFilter()).not.toHaveProperty('search');
    });
  });
});
