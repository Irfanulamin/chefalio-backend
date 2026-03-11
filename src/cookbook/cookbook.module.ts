import { Module } from '@nestjs/common';
import { CookbookService } from './cookbook.service';
import { CookbookController } from './cookbook.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Cookbook, CookbookSchema } from './schemas/cookbook.schema';
import { User, UserSchema } from 'src/user/schema/user.schema';
import { CloudinaryService } from 'src/services/cloudinary.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Cookbook.name, schema: CookbookSchema },
    ]),
  ],
  controllers: [CookbookController],
  providers: [CookbookService, CloudinaryService],
})
export class CookbookModule {}
