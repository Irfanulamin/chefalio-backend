import { IsIn, IsNotEmpty, IsString } from 'class-validator';

export class UpdateCookbookPurchaseDto {
  @IsNotEmpty()
  @IsString()
  @IsIn(['shipped', 'delivered'], {
    message: 'Invalid payment status',
  })
  paymentStatus: string;
}
