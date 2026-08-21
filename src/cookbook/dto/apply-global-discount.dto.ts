import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

/**
 * Body of PATCH /cookbooks/admin/discount/global.
 *
 * This endpoint used to take a bare `@Body('discount') discount: number`,
 * which ValidationPipe cannot validate — there is no class to attach rules to,
 * and the TypeScript annotation is erased at runtime. The write then goes
 * through `updateMany(..., { $set: { discount } })`, and Mongoose skips schema
 * validators on `$set` unless asked, so nothing checked the bounds on the way
 * to *every cookbook in the catalogue*.
 *
 * 0–15 matches the schema's `min: 0, max: 15` and the admin UI's own check.
 */
export class ApplyGlobalDiscountDto {
  @Type(() => Number)
  @IsInt({ message: 'discount must be a whole number of percent' })
  @Min(0, { message: 'discount cannot be negative' })
  @Max(15, { message: 'discount cannot exceed 15%' })
  discount!: number;
}
