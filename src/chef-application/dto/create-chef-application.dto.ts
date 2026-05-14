import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateChefApplicationDto {
  @IsString()
  @IsNotEmpty({ message: 'Full name is required' })
  fullName!: string;

  @IsString()
  @IsNotEmpty({ message: 'Bio is required' })
  bio!: string;

  @IsString()
  @IsNotEmpty({ message: 'Specialty is required' })
  specialty!: string;

  @Type(() => Number)
  @IsNumber({}, { message: 'Years of experience must be a number' })
  @Min(0, { message: 'Years of experience cannot be negative' })
  @Max(60, { message: 'Years of experience seems too high' })
  yearsOfExperience!: number;

  @IsEnum(['passport', 'nid', 'driving_license'], {
    message: 'KYC type must be passport, nid, or driving_license',
  })
  kycType!: string;

  @IsUrl({}, { message: 'Please provide a valid reference website URL' })
  referenceUrl!: string;

  @IsOptional()
  @IsUrl({}, { message: 'Please provide a valid YouTube URL' })
  youtubeUrl?: string;

  @IsOptional()
  @IsString()
  achievements?: string; // JSON string of string[] — parsed in service

  @IsOptional()
  @IsString()
  instagramUrl?: string;

  @IsOptional()
  @IsString()
  facebookUrl?: string;

  @IsOptional()
  @IsString()
  twitterUrl?: string;
}
