import { IsArray, IsMongoId, ArrayNotEmpty, ArrayMaxSize } from 'class-validator';

export class BatchStatsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(50)
  @IsMongoId({ each: true })
  recipeIds!: string[];
}
