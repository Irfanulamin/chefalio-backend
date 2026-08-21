/**
 * The response envelope, in one place.
 *
 * Every service builds its own reply object, and the shape drifted: most list
 * endpoints return the rows as `data` with `pagination` beside it, but
 * `getAllRecipes`, `getChefRecipes` and `getChefCookbooks` nested both inside
 * `data` (`data.recipes`, `data.pagination`). A client could not unwrap a list
 * response without knowing which endpoint it came from.
 *
 * These helpers state the majority shape once. They are deliberately not an
 * interceptor: an interceptor would rewrite all ~70 endpoints at once, and the
 * live frontend reads several of them by hand. Services opt in as they are
 * touched, and the shape they opt into is this one.
 */

export interface Pagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ApiResponse<T> {
  success: true;
  statusCode: number;
  message: string;
  data: T;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: Pagination;
}

/** Page arithmetic — `Math.ceil(total / limit)`, written out once. */
export function paginate(
  total: number,
  page: number,
  limit: number,
): Pagination {
  return { total, page, limit, totalPages: Math.ceil(total / limit) };
}

/** A single payload: `data` is the thing itself. */
export function ok<T>(
  data: T,
  message: string,
  statusCode = 200,
): ApiResponse<T> {
  return { success: true, statusCode, message, data };
}

/**
 * A page of rows: `data` is the array, `pagination` sits beside it.
 *
 * Note what this rules out — there is no way to express `data.recipes` with
 * this helper, which is the point.
 */
export function paginated<T>(
  rows: T[],
  message: string,
  total: number,
  page: number,
  limit: number,
): PaginatedResponse<T> {
  return {
    success: true,
    statusCode: 200,
    message,
    data: rows,
    pagination: paginate(total, page, limit),
  };
}
