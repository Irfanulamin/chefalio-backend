import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ChefProfileController } from './chef-profile.controller';
import { ChefProfileService } from './chef-profile.service';
import { ChefProfile, ChefProfileSchema } from './schemas/chef-profile.schema';
import { User, UserSchema } from '../user/schema/user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ChefProfile.name, schema: ChefProfileSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [ChefProfileController],
  providers: [ChefProfileService],
  exports: [MongooseModule],
})
export class ChefProfileModule {}
