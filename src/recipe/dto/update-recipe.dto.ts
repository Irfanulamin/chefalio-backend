import {
  IsArray,
  ValidateNested,
  IsOptional,
  IsString,
  MinLength,
  MaxLength,
  ArrayMinSize,
  ArrayMaxSize,
  IsIn,
} from 'class-validator';
import { Type, Transform, plainToInstance } from 'class-transformer';

export class InstructionDto {
  @IsOptional()
  step?: number;

  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  instruction?: string;
}

export class UpdateRecipeDto {
  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(100)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsString({ each: true })
  ingredients?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InstructionDto)
  @Transform(({ value }) => {
    let arr: any = [];
    if (!value) return [];
    if (Array.isArray(value)) arr = value;
    else {
      try {
        arr = JSON.parse(value);
        if (!Array.isArray(arr)) arr = [];
      } catch {
        arr = [];
      }
    }
    return arr.map((i) => plainToInstance(InstructionDto, i));
  })
  instructions?: InstructionDto[];

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  @IsIn(['beginner', 'intermediate', 'advance'], {
    message: 'Difficulty must be either beginner, intermediate, or advance',
  })
  difficulty?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  removeImages?: string[]; // URLs to delete from Cloudinary
}
