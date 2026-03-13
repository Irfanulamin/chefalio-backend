import {
  IsArray,
  ValidateNested,
  IsNotEmpty,
  IsString,
  MinLength,
  MaxLength,
  ArrayMinSize,
  ArrayMaxSize,
  IsIn,
} from 'class-validator';
import { Type, Transform, plainToInstance } from 'class-transformer';
import { InstructionDto } from './instruction.dto';

export class CreateRecipeDto {
  @IsNotEmpty()
  @IsString()
  @MinLength(5)
  @MaxLength(100)
  title: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  description: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsString({ each: true })
  ingredients: string[];

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
  instructions: InstructionDto[];

  @IsNotEmpty({ message: 'Tags are required' })
  @IsArray({ message: 'Tags must be an array' })
  @ArrayMinSize(1, { message: 'At least 1 tags are required' })
  @ArrayMaxSize(5, { message: 'No more than 5 tags are allowed' })
  @IsString({ each: true })
  tags: string[];

  @IsNotEmpty()
  @IsString()
  @IsIn(['beginner', 'intermediate', 'advance'], {
    message: 'Difficulty must be either beginner, intermediate, or advance',
  })
  difficulty: string;
}
