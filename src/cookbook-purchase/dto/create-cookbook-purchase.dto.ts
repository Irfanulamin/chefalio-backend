import { IsEmail, IsOptional, IsString } from 'class-validator';

export class BillingAddressDto {
  @IsOptional()
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  address: string;

  @IsOptional()
  @IsString()
  city: string;

  @IsOptional()
  @IsString()
  state: string;

  @IsOptional()
  @IsString()
  postalCode: string;

  @IsOptional()
  @IsString()
  country: string;
}

export class CreateCookbookPurchaseDto {
  @IsString()
  cookbookId: string;

  @IsEmail()
  receiptEmail: string;

  @IsOptional()
  billingAddress: BillingAddressDto;
}
