import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ChefApplicationController } from './chef-application.controller';
import { ChefApplicationService } from './chef-application.service';
import {
  ChefApplication,
  ChefApplicationSchema,
} from './schemas/chef-application.schema';
import { User, UserSchema } from '../user/schema/user.schema';
import { CloudinaryService } from '../services/cloudinary.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ChefApplication.name, schema: ChefApplicationSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [ChefApplicationController],
  providers: [ChefApplicationService, CloudinaryService],
})
export class ChefApplicationModule {}
