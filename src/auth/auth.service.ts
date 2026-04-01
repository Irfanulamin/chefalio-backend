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
import { InjectModel } from '@nestjs/mongoose';
import { MailService } from '../services/mail.service';
import { ResetPasswordDto } from './dto/resetPassword.dto';
import { ChangePasswordDto } from './dto/changePassword.dto';
import type { Response } from 'express';
import crypto from 'crypto';
import { User } from '../user/schema/user.schema';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
    @InjectModel(ResetToken.name) private resetTokenModel: Model<ResetToken>,
    @InjectModel(User.name) private userModel: Model<User>,
  ) {}
  async userRegister(registerUserDto: RegisterUserDto, res: Response) {
    const hash = await bcrypt.hash(registerUserDto.password, 10);
    const user = await this.userService.createUser({
      ...registerUserDto,
      password: hash,
    });

    const payload = { sub: user._id, role: user.role };
    const token = await this.jwtService.signAsync(payload);

    res.cookie('access_token', token, {
      httpOnly: true,
      secure: true, // MUST be true when sameSite is 'none'
      sameSite: 'none', // Changed from 'lax' to allow cross-origin
      maxAge: 3600000,
    });

    return {
      success: true,
      statusCode: 200,
      message: 'User registered successfully',
      role: user.role,
    };
  }

  async userLogin(loginUserDto: LoginUserDto, res: Response) {
    const userNameOrEmail = loginUserDto.usernameOrEmail;

    if (!userNameOrEmail) {
      throw new BadRequestException('Email or username is required');
    }

    const user = await this.userService.findByEmailOrUsername(userNameOrEmail);

    if (
      !user ||
      !(await bcrypt.compare(loginUserDto.password, user.password))
    ) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (!user.isActive) {
      throw new ForbiddenException(
        'Your account is inactive. Please contact support.',
      );
    }

    const payload = { sub: user._id, role: user.role };
    const token = await this.jwtService.signAsync(payload);

    res.cookie('access_token', token, {
      httpOnly: true,
      secure: true, // MUST be true when sameSite is 'none'
      sameSite: 'none', // Changed from 'lax' to allow cross-origin
      maxAge: 3600000,
    });

    return {
      success: true,
      statusCode: 200,
      message: 'Login successful',
      role: user.role,
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
        expiresAt: new Date(Date.now() + 1800000),
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
}
