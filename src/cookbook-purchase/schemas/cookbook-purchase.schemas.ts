import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CookbookPurchaseDocument = CookbookPurchase & Document;

@Schema({ timestamps: true })
export class CookbookPurchase {
  @Prop({
    type: Types.ObjectId,
    ref: 'Cookbook',
    required: true,
    index: true,
  })
  cookbookId!: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  buyerId!: Types.ObjectId;

  @Prop({ required: true })
  cookbookTitle!: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  chefId!: Types.ObjectId;

  @Prop({ required: true })
  cookbookImage!: string;

  @Prop({ required: true })
  price!: number;

  @Prop({ required: true, index: true, unique: true })
  stripeSessionId!: string;

  @Prop({
    enum: ['pending', 'paid', 'failed', 'refunded', 'shipped', 'delivered'],
    default: 'pending',
    index: true,
  })
  paymentStatus!: string;

  @Prop({ type: Object })
  billingAddress!: {
    name: string;
    address: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  @Prop()
  receiptEmail!: string;
}

export const CookbookPurchaseSchema =
  SchemaFactory.createForClass(CookbookPurchase);
