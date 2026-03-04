/* eslint-disable @typescript-eslint/no-unsafe-call */
import { IsEmail, IsNotEmpty, IsString, ValidateIf } from 'class-validator';

export class LoginUserDto {
  @ValidateIf((dto) => !dto.username)
  @IsEmail()
  @IsNotEmpty()
  email?: string;

  @ValidateIf((dto) => !dto.email)
  @IsString()
  @IsNotEmpty()
  username?: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}
