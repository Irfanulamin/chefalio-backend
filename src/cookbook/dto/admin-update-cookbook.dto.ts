import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

/**
 * Body of PATCH /cookbooks/admin/:id.
 *
 * The controller previously typed this parameter with an inline TypeScript
 * type literal. Types are erased at runtime, so ValidationPipe had no metatype
 * to work with and `whitelist`/`forbidNonWhitelisted` never engaged — an admin
 * request could set any field on the document, including `authorId`.
 *
 * Fields are exactly the ones the admin cookbooks page sends, all optional
 * because it is a partial update.
 */
export class AdminUpdateCookbookDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'title cannot be empty' })
  title?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'description cannot be empty' })
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0, { message: 'price cannot be negative' })
  price?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'stockCount must be a whole number' })
  @Min(0, { message: 'stockCount cannot be negative' })
  stockCount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'discount must be a whole number of percent' })
  @Min(0, { message: 'discount cannot be negative' })
  @Max(15, { message: 'discount cannot exceed 15%' })
  discount?: number;
}
