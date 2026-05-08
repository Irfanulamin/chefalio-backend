import { IsArray, IsString, ArrayNotEmpty, ArrayMaxSize } from 'class-validator';
import { Transform } from 'class-transformer';

export class SuggestRecipesDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(15)
  @IsString({ each: true })
  @Transform(({ value }) =>
    (value as string[]).map((v) => v.trim().toLowerCase()),
  )
  ingredients!: string[];
}
