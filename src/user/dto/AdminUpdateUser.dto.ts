import { IsBoolean, IsOptional, IsString, IsIn } from 'class-validator';

export class AdminUpdateUserDto {
  @IsOptional()
  @IsString()
  @IsIn(['user', 'chef', 'admin'], {
    message: 'Role must be either user, chef, or admin',
  })
  role?: string;

  @IsOptional()
  @IsBoolean({ message: 'isActive must be a boolean value' })
  isActive?: boolean;
}
