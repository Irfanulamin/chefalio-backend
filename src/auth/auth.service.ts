import { BadRequestException, Injectable } from '@nestjs/common';
import { UserService } from 'src/user/user.service';
import { RegisterUserDto } from './dto/registerUser.dto';
import bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { LoginUserDto } from './dto/loginUser.dto';
import { ForgotPasswordDto } from './dto/forgotPassword.dto';
import { nanoid } from 'nanoid';
import { Model } from 'mongoose';
import { ResetToken } from './schemas/reset-token.schema';
import { InjectModel } from '@nestjs/mongoose';
import { MailService } from 'src/services/mail.service';
import { ResetPasswordDto } from './dto/resetPassword.dto';
import { ChangePasswordDto } from './dto/changePassword.dto';
import type { Response } from 'express';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
    @InjectModel(ResetToken.name) private resetTokenModel: Model<ResetToken>,
  ) {}
  async userRegister(registerUserDto: RegisterUserDto) {
    const hash = await bcrypt.hash(registerUserDto.password, 10);
    const user = await this.userService.createUser({
      ...registerUserDto,
      password: hash,
    });

    const payload = { sub: user._id, role: user.role };
    const token = await this.jwtService.signAsync(payload);

    return {
      success: true,
      statusCode: 200,
      message: 'User registered successfully',
      access_token: token,
    };
  }

  async userLogin(loginUserDto: LoginUserDto, res: Response) {
    const userNameOrEmail = loginUserDto.email ?? loginUserDto.username;

    if (!userNameOrEmail) {
      throw new BadRequestException('Email or username is required');
    }

    const user = await this.userService.findByEmailOrUsername(userNameOrEmail);

    if (!user) {
      return {
        success: false,
        statusCode: 401,
        message: 'The email address is not registered',
      };
    }

    const isPasswordValid = await bcrypt.compare(
      loginUserDto.password,
      user.password,
    );

    if (!isPasswordValid) {
      return {
        statusCode: 401,
        message: 'Invalid password or email address',
      };
    }

    if (!user.isActive) {
      return {
        success: false,
        statusCode: 403,
        message: 'Your account is inactive. Please contact support.',
      };
    }

    const payload = { sub: user._id, role: user.role };
    const token = await this.jwtService.signAsync(payload);

    res.cookie('access_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 3600000,
    });

    return {
      success: true,
      statusCode: 200,
      message: 'Login successful',
      access_token: token,
    };
  }

  async getProfile(userId: string) {
    return await this.userService.userDetails(userId);
  }

  async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    const user = await this.userService.findByEmailOrUsername(
      forgotPasswordDto.email,
    );
    if (!user) {
      return {
        success: false,
        statusCode: 404,
        message:
          'If the email address is registered, you will receive password reset instructions shortly.',
      };
    }

    const refreshToken = nanoid(64);

    await this.resetTokenModel.create({
      token: refreshToken,
      user: user._id,
      expiresAt: new Date(Date.now() + 1800000), // 30 minutes
    });

    await this.mailService.sendMail(user.email, refreshToken);

    return {
      success: true,
      statusCode: 200,
      message:
        'Password reset instructions have been sent to your email. Please check your inbox or spam folder.',
    };
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    const token = await this.resetTokenModel.findOne({
      token: resetPasswordDto.resetToken,
      expiresAt: { $gte: new Date() },
    });

    if (!token) {
      return {
        success: false,
        statusCode: 400,
        message: 'Invalid or expired reset token',
      };
    }

    const user = await this.userService.getUserById(token.user);

    if (!user) {
      return {
        success: false,
        statusCode: 404,
        message: 'User not found',
      };
    }

    user.password = await bcrypt.hash(resetPasswordDto.newPassword, 10);
    await user.save();
    await this.resetTokenModel.deleteOne({ _id: token._id });

    return {
      success: true,
      statusCode: 200,
      message: 'Password has been reset successfully',
    };
  }

  async changePassword(userId: string, changePasswordDto: ChangePasswordDto) {
    const user = await this.userService.getUserById(userId);
    if (!user) {
      return {
        success: false,
        statusCode: 404,
        message: 'User not found',
      };
    }

    const isCurrentPasswordValid = await bcrypt.compare(
      changePasswordDto.currentPassword,
      user.password,
    );

    if (!isCurrentPasswordValid) {
      return {
        success: false,
        statusCode: 400,
        message: 'Current password is incorrect',
      };
    }
    user.password = await bcrypt.hash(changePasswordDto.newPassword, 10);
    await user.save();
    return {
      success: true,
      statusCode: 200,
      message: 'Password has been changed successfully',
    };
  }
}
