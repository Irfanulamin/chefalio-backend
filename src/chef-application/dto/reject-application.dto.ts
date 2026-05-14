import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RejectApplicationDto {
  @IsString()
  @IsNotEmpty({ message: 'Rejection note is required' })
  @MaxLength(1000, { message: 'Rejection note must be under 1000 characters' })
  rejectionNote!: string;
}
