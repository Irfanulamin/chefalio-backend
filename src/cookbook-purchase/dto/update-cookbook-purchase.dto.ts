import { IsIn, IsString } from 'class-validator';

export class UpdateCookbookPurchaseDto {
  @IsIn(['pending', 'paid', 'failed', 'refunded', 'shipped', 'delivered'], {
    message:
      'Payment Status must be one of: pending, paid, failed, refunded, shipped, delivered',
  })
  @IsString()
  paymentStatus:
    | 'pending'
    | 'paid'
    | 'failed'
    | 'refunded'
    | 'shipped'
    | 'delivered';
}
