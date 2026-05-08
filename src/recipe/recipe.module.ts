import { forwardRef, Module } from '@nestjs/common';
import { RecipeService } from './recipe.service';
import { RecipeController } from './recipe.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../user/schema/user.schema';
import { CloudinaryService } from '../services/cloudinary.service';
import { Recipe, RecipeSchema } from './schemas/recipe.schema';
import { AuthModule } from '../auth/auth.module';
import { NotificationModule } from '../notifications/notification.module';

@Module({
  imports: [
    forwardRef(() => AuthModule),
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Recipe.name, schema: RecipeSchema },
    ]),
    NotificationModule,
  ],
  controllers: [RecipeController],
  providers: [RecipeService, CloudinaryService],
  exports: [RecipeService],
})
export class RecipeModule {}
