import { IsNotEmpty, IsString } from 'class-validator';

export class ResendVerificationDto {
  @IsString()
  @IsNotEmpty()
  usernameOrEmail!: string;
}
