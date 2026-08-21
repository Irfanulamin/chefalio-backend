import { ChefService } from './chef.service';
import type { Model } from 'mongoose';
import type { User } from '../user/schema/user.schema';

/**
 * Catalogue visibility.
 *
 * `getAllChefs` hides seeded demo accounts from the public directory, so the
 * list a visitor browses is real chefs only. `getChefCount` backs the "N chefs"
 * figure on the same screen. If the two disagree about who is visible, the
 * headline number counts chefs the list will never show.
 *
 * These tests read the filter each method actually sends to Mongo rather than
 * asserting a hardcoded number, so they stay true if the visibility rule
 * changes — what they pin down is that both methods apply the *same* rule.
 */
describe('ChefService — public catalogue visibility', () => {
  type Filter = Record<string, unknown>;

  function build() {
    const countFilters: Filter[] = [];
    const matchFilters: Filter[] = [];

    const userModel = {
      aggregate: (pipeline: Record<string, Filter>[]) => {
        const match = pipeline.find((s) => '$match' in s);
        if (match) matchFilters.push(match.$match);
        return Promise.resolve([]);
      },
      countDocuments: (filter: Filter = {}) => {
        countFilters.push(filter);
        return Promise.resolve(0);
      },
    };

    const service = new ChefService(
      userModel as unknown as Model<User>,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    return { service, countFilters, matchFilters };
  }

  it('hides demo accounts from the public chef list', async () => {
    const { service, matchFilters } = build();
    await service.getAllChefs(1, 12, '');

    expect(matchFilters).toHaveLength(1);
    expect(matchFilters[0]).toMatchObject({
      role: 'chef',
      isActive: true,
      isDemo: { $ne: true },
    });
  });

  it('counts exactly the chefs the list would show', async () => {
    const { service, matchFilters } = build();
    await service.getAllChefs(1, 12, '');
    const listed = matchFilters[0];

    const counted = build();
    await counted.service.getChefCount();

    expect(counted.countFilters).toHaveLength(1);
    expect(counted.countFilters[0]).toEqual(listed);
  });

  it('excludes demo accounts from the headline count', async () => {
    const { service, countFilters } = build();
    await service.getChefCount();

    expect(countFilters[0]).toMatchObject({ isDemo: { $ne: true } });
  });

  it('still reports a count and the standard envelope', async () => {
    const { service } = build();
    const res = await service.getChefCount();

    expect(res).toMatchObject({
      success: true,
      statusCode: 200,
      data: { total: 0 },
    });
  });
});
