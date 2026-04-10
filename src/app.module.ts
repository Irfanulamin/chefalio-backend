import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RecipeModule } from './recipe/recipe.module';
import { RecipeInteractionModule } from './recipe-interaction/recipe-interaction.module';
import { CookbookModule } from './cookbook/cookbook.module';
import { CookbookPurchaseModule } from './cookbook-purchase/cookbook-purchase.module';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { APP_GUARD } from '@nestjs/core';

@Module({
  imports: [
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: '1h' },
    }),
    AuthModule,
    UserModule,
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.getOrThrow<string>('MONGODB_URI'),
      }),
    }),
    RecipeModule,
    RecipeInteractionModule,
    CookbookModule,
    CookbookPurchaseModule,
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 200 }]),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    ConfigService,
    JwtService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
