import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UserModule } from 'src/user/user.module';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ResetToken, ResetTokenSchema } from './schemas/reset-token.schema';
import { MailService } from 'src/services/mail.service';

@Module({
  imports: [
    UserModule,
    MongooseModule.forFeature([
      { name: ResetToken.name, schema: ResetTokenSchema },
    ]),
    ConfigModule.forRoot(),
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: '1h' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, MailService],
})
export class AuthModule {}
