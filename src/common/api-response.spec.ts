import { ok, paginate, paginated } from './api-response';

/**
 * The response envelope.
 *
 * Every service hand-rolls its own object literal, and three of them drifted:
 * `getAllRecipes`, `getChefRecipes` and `getChefCookbooks` nested the array
 * and its pagination *inside* `data`, while every other list endpoint returns
 * `data` as the array with `pagination` beside it. The client had to know
 * which endpoint used which shape.
 *
 * These helpers define the majority shape once. What the tests pin down is
 * that `data` is always the payload itself — never a wrapper around it.
 */
describe('api response envelope', () => {
  describe('paginate', () => {
    it('computes the page count', () => {
      expect(paginate(95, 1, 10)).toEqual({
        total: 95,
        page: 1,
        limit: 10,
        totalPages: 10,
      });
    });

    it('rounds a partial last page up', () => {
      expect(paginate(11, 1, 10).totalPages).toBe(2);
    });

    it('is zero pages for an empty result', () => {
      expect(paginate(0, 1, 10).totalPages).toBe(0);
    });

    it('is one page when the result exactly fills it', () => {
      expect(paginate(10, 1, 10).totalPages).toBe(1);
    });
  });

  describe('paginated', () => {
    const rows = [{ _id: 'a' }, { _id: 'b' }];

    it('puts the rows in data, not in a wrapper inside data', () => {
      const res = paginated(rows, 'Recipes retrieved successfully', 2, 1, 10);
      expect(res.data).toBe(rows);
      expect(Array.isArray(res.data)).toBe(true);
    });

    it('puts pagination beside data, not inside it', () => {
      const res = paginated(rows, 'ok', 2, 1, 10);
      expect(res.pagination).toEqual({
        total: 2,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
      expect(res.data).not.toHaveProperty('pagination');
    });

    it('carries the standard envelope fields', () => {
      const res = paginated(rows, 'Recipes retrieved successfully', 2, 1, 10);
      expect(res).toMatchObject({
        success: true,
        statusCode: 200,
        message: 'Recipes retrieved successfully',
      });
    });

    it('describes an empty page without inventing rows', () => {
      const res = paginated([], 'none', 0, 3, 10);
      expect(res.data).toEqual([]);
      expect(res.pagination).toEqual({
        total: 0,
        page: 3,
        limit: 10,
        totalPages: 0,
      });
    });

    it('has exactly the five envelope keys', () => {
      const res = paginated(rows, 'ok', 2, 1, 10);
      expect(Object.keys(res).sort()).toEqual([
        'data',
        'message',
        'pagination',
        'statusCode',
        'success',
      ]);
    });
  });

  describe('ok', () => {
    it('wraps a single payload', () => {
      const recipe = { _id: 'r1' };
      expect(ok(recipe, 'Recipe retrieved successfully')).toEqual({
        success: true,
        statusCode: 200,
        message: 'Recipe retrieved successfully',
        data: recipe,
      });
    });

    it('preserves an explicit status code', () => {
      expect(ok({ _id: 'r1' }, 'Created', 201).statusCode).toBe(201);
    });

    it('does not add a pagination key', () => {
      expect(ok({}, 'x')).not.toHaveProperty('pagination');
    });
  });
});
