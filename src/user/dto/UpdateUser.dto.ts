import { IsOptional, IsString, IsUrl, MinLength } from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsUrl()
  profile_url?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;
}
