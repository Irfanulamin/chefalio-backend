import { IsString, IsNotEmpty, IsNumber, Min } from 'class-validator';

export class CreateCookbookDto {
  @IsNotEmpty()
  @IsString()
  title: string;

  @IsNotEmpty()
  @IsString()
  description: string;

  @IsNotEmpty({ message: 'Image file is required' })
  image: Express.Multer.File;

  @IsNumber()
  @Min(0)
  price: number;

  @IsNumber()
  @Min(0)
  stockCount: number;
}
