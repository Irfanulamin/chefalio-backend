import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { UserService } from '../user/user.service';
import { RegisterUserDto } from './dto/registerUser.dto';
import bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { LoginUserDto } from './dto/loginUser.dto';
import { ForgotPasswordDto } from './dto/forgotPassword.dto';
import { nanoid } from 'nanoid';
import { Model } from 'mongoose';
import { ResetToken } from './schemas/reset-token.schema';
import { EmailVerificationToken } from './schemas/email-verification-token.schema';
import { InjectModel } from '@nestjs/mongoose';
import { MailService } from '../services/mail.service';
import { ResetPasswordDto } from './dto/resetPassword.dto';
import { ChangePasswordDto } from './dto/changePassword.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import type { Response } from 'express';
import crypto from 'crypto';
import { User } from '../user/schema/user.schema';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
    @InjectModel(ResetToken.name) private resetTokenModel: Model<ResetToken>,
    @InjectModel(EmailVerificationToken.name)
    private emailVerificationTokenModel: Model<EmailVerificationToken>,
    @InjectModel(User.name) private userModel: Model<User>,
  ) {}

  private get frontendUrl() {
    return this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000');
  }

  private setCookie(res: Response, token: string) {
    res.cookie('access_token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'none' as const,
      maxAge: 3_600_000,
    });
  }

  private async createVerificationToken(userId: Types.ObjectId): Promise<string> {
    const rawToken = nanoid(64);
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
    await this.emailVerificationTokenModel.deleteMany({ user: userId });
    await this.emailVerificationTokenModel.create({
      token: hashedToken,
      user: userId,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    return rawToken;
  }

  async userRegister(registerUserDto: RegisterUserDto) {
    const hash = await bcrypt.hash(registerUserDto.password, 10);
    const user = await this.userService.createUser({
      ...registerUserDto,
      password: hash,
    });

    const rawToken = await this.createVerificationToken(user._id);
    const verificationLink = `${this.frontendUrl}/verify-email?token=${rawToken}`;
    await this.mailService.sendVerificationEmail(
      user.email,
      user.fullName,
      verificationLink,
    );

    return {
      success: true,
      statusCode: 200,
      message: 'Account created! Please check your email to verify your address.',
      email: user.email,
    };
  }

  async userLogin(loginUserDto: LoginUserDto, res: Response) {
    const userNameOrEmail = loginUserDto.usernameOrEmail;

    if (!userNameOrEmail) {
      throw new BadRequestException('Email or username is required');
    }

    const user = await this.userService.findByEmailOrUsername(userNameOrEmail);

    if (!user || !user.password) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!(await bcrypt.compare(loginUserDto.password, user.password))) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new ForbiddenException(
        'Your account is inactive. Please contact support.',
      );
    }

    if (!user.isEmailVerified) {
      throw new ForbiddenException(
        'Email not verified. Please check your inbox or request a new verification link.',
      );
    }

    const payload = { sub: user._id, role: user.role };
    const token = await this.jwtService.signAsync(payload);
    this.setCookie(res, token);

    return {
      success: true,
      statusCode: 200,
      message: 'Login successful',
      role: user.role,
    };
  }

  async verifyEmail(dto: VerifyEmailDto, res: Response) {
    const hashed = crypto.createHash('sha256').update(dto.token).digest('hex');
    const tokenDoc = await this.emailVerificationTokenModel.findOne({
      token: hashed,
      expiresAt: { $gte: new Date() },
    });

    if (!tokenDoc) {
      throw new BadRequestException(
        'Invalid or expired verification link. Please request a new one.',
      );
    }

    await this.userModel.findByIdAndUpdate(tokenDoc.user, {
      isEmailVerified: true,
    });
    await this.emailVerificationTokenModel.deleteOne({ _id: tokenDoc._id });

    const user = await this.userModel.findById(tokenDoc.user);
    if (!user) throw new BadRequestException('User not found.');

    const payload = { sub: user._id, role: user.role };
    const jwtToken = await this.jwtService.signAsync(payload);
    this.setCookie(res, jwtToken);

    return {
      success: true,
      statusCode: 200,
      message: 'Email verified successfully. Welcome to Chefalio!',
      role: user.role,
    };
  }

  async resendVerification(dto: ResendVerificationDto) {
    const user = await this.userService.findByEmailOrUsername(
      dto.usernameOrEmail,
    );

    if (user && !user.isEmailVerified && user.authProvider === 'local') {
      const rawToken = await this.createVerificationToken(user._id);
      const verificationLink = `${this.frontendUrl}/verify-email?token=${rawToken}`;
      await this.mailService.sendVerificationEmail(
        user.email,
        user.fullName,
        verificationLink,
      );
    }

    return {
      success: true,
      statusCode: 200,
      message:
        'If that account exists and is unverified, a new verification link has been sent.',
    };
  }

  async getProfile(userId: string) {
    return await this.userService.userDetails(userId);
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.userService.findByEmailOrUsername(dto.email);

    if (user) {
      const rawToken = nanoid(64);
      const hashedToken = crypto
        .createHash('sha256')
        .update(rawToken)
        .digest('hex');
      await this.resetTokenModel.create({
        token: hashedToken,
        user: user._id,
        expiresAt: new Date(Date.now() + 1_800_000),
      });
      await this.mailService.sendMail(user.email, rawToken);
    }

    return {
      success: true,
      statusCode: 200,
      message:
        'If that email is registered, password reset instructions have been sent.',
    };
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    const hashed = crypto
      .createHash('sha256')
      .update(resetPasswordDto.resetToken)
      .digest('hex');
    const token = await this.resetTokenModel.findOne({
      token: hashed,
      expiresAt: { $gte: new Date() },
    });

    if (!token) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const user = await this.userService.getUserById(token.user);

    if (!user) {
      throw new BadRequestException('User not found');
    }

    await this.userModel.findByIdAndUpdate(user._id, {
      password: await bcrypt.hash(resetPasswordDto.newPassword, 10),
    });
    await this.resetTokenModel.deleteOne({ _id: token._id });

    return {
      success: true,
      statusCode: 200,
      message: 'Password has been reset successfully',
    };
  }

  async changePassword(userId: string, changePasswordDto: ChangePasswordDto) {
    const user = await this.userModel.findById(userId).select('+password');
    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (!user.password) {
      throw new BadRequestException(
        'Password change is not available for social login accounts',
      );
    }

    const isCurrentPasswordValid = await bcrypt.compare(
      changePasswordDto.currentPassword,
      user.password,
    );

    if (!isCurrentPasswordValid) {
      throw new BadRequestException('Current password is incorrect');
    }
    await this.userModel.findByIdAndUpdate(userId, {
      password: await bcrypt.hash(changePasswordDto.newPassword, 10),
    });
    return {
      success: true,
      statusCode: 200,
      message: 'Password has been changed successfully',
    };
  }

  async oauthLogin(
    user: { _id: string; role: string; isActive: boolean },
    res: Response,
  ) {
    if (!user.isActive) {
      return res.redirect(`${this.frontendUrl}/login?error=account_deactivated`);
    }

    const payload = { sub: user._id, role: user.role };
    const token = await this.jwtService.signAsync(payload);
    this.setCookie(res, token);

    const redirectPath =
      user.role === 'chef'
        ? '/chef/dashboard'
        : user.role === 'admin'
          ? '/admin/dashboard'
          : '/recipes';
    res.redirect(`${this.frontendUrl}${redirectPath}`);
  }
}
