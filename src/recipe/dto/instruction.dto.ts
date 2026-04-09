import {
  IsNotEmpty,
  IsNumber,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class InstructionDto {
  @IsNotEmpty()
  @IsNumber()
  step!: number;

  @IsNotEmpty()
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  instruction!: string;
}
