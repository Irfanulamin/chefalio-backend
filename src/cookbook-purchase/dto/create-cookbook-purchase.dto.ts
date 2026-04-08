import { IsDefined, IsEmail, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class BillingAddressDto {
  @IsString()
  name!: string;

  @IsString()
  address!: string;

  @IsString()
  city!: string;

  @IsString()
  state!: string;

  @IsString()
  postalCode!: string;

  @IsString()
  country!: string;
}

export class CreateCookbookPurchaseDto {
  @IsString()
  cookbookId!: string;

  @IsEmail()
  receiptEmail!: string;

  @IsDefined()
  @ValidateNested()
  @Type(() => BillingAddressDto)
  billingAddress!: BillingAddressDto;
}
