import { Type } from 'class-transformer';
import { IsString, IsNotEmpty, IsNumber, Min } from 'class-validator';

export class CreateCookbookDto {
  @IsNotEmpty()
  @IsString()
  title!: string;

  @IsNotEmpty()
  @IsString()
  description!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  stockCount!: number;
}
