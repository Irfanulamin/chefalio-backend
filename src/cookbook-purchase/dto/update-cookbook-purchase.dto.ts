import { PartialType } from '@nestjs/mapped-types';
import { CreateCookbookPurchaseDto } from './create-cookbook-purchase.dto';

export class UpdateCookbookPurchaseDto extends PartialType(CreateCookbookPurchaseDto) {}
