import {
  Body,
  Controller,
  Get,
  Post,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterUserDto } from './dto/registerUser.dto';
import { LoginUserDto } from './dto/loginUser.dto';
import { AuthGuard } from './auth.guard';
import { ForgotPasswordDto } from './dto/forgotPassword.dto';
import { ResetPasswordDto } from './dto/resetPassword.dto';
import { ChangePasswordDto } from './dto/changePassword.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import type { Response } from 'express';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AuthGuard as PassportAuthGuard } from '@nestjs/passport';
import { AlreadyLoggedInGuard } from './already-logged-in.guard';
import { GoogleOAuthGuard } from './google-oauth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @UseGuards(AlreadyLoggedInGuard)
  @Post('/register')
  async register(@Body() registerUserDto: RegisterUserDto) {
    return await this.authService.userRegister(registerUserDto);
  }

  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @UseGuards(AlreadyLoggedInGuard, ThrottlerGuard)
  @Post('/login')
  async login(
    @Body() loginUserDto: LoginUserDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return await this.authService.userLogin(loginUserDto, res);
  }

  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @UseGuards(AlreadyLoggedInGuard, ThrottlerGuard)
  @Post('/verify-email')
  async verifyEmail(
    @Body() dto: VerifyEmailDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return await this.authService.verifyEmail(dto, res);
  }

  @Throttle({ default: { ttl: 60000, limit: 3 } })
  @UseGuards(AlreadyLoggedInGuard, ThrottlerGuard)
  @Post('/resend-verification')
  async resendVerification(@Body() dto: ResendVerificationDto) {
    return await this.authService.resendVerification(dto);
  }

  @UseGuards(AuthGuard)
  @Get('/me')
  getMe(@Request() req) {
    return { userId: req.user.sub, role: req.user.role };
  }

  @Post('/logout')
  logout(@Res({ passthrough: true }) res: Response) {
    const cookieOpts = { httpOnly: true, secure: true, sameSite: 'none' as const };
    res.clearCookie('access_token', cookieOpts);
    res.clearCookie('refresh_token', cookieOpts);
    return {
      success: true,
      statusCode: 200,
      message: 'User logged out successfully.',
    };
  }

  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('/refresh')
  async refresh(
    @Request() req,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.refreshToken(req, res);
  }

  @UseGuards(AuthGuard)
  @Post('/change-password')
  async changePassword(
    @Request() req,
    @Body() changePasswordDto: ChangePasswordDto,
  ) {
    const userId: string = req.user.sub;
    return await this.authService.changePassword(userId, changePasswordDto);
  }

  @Throttle({ default: { ttl: 60000, limit: 3 } })
  @UseGuards(AlreadyLoggedInGuard, ThrottlerGuard)
  @Post('/forgot-password')
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return await this.authService.forgotPassword(forgotPasswordDto);
  }

  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @UseGuards(AlreadyLoggedInGuard, ThrottlerGuard)
  @Post('/reset-password')
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return await this.authService.resetPassword(resetPasswordDto);
  }

  @UseGuards(AuthGuard)
  @Get('/profile')
  async getProfile(@Request() req) {
    const userId: string = req.user.sub;
    return await this.authService.getProfile(userId);
  }

  @Get('/google')
  @UseGuards(AlreadyLoggedInGuard, PassportAuthGuard('google'))
  googleAuth() {}

  @Get('/google/callback')
  @UseGuards(GoogleOAuthGuard)
  async googleCallback(@Request() req, @Res() res: Response) {
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
    if (!req.user) {
      return res.redirect(`${frontendUrl}/login?error=oauth_failed`);
    }
    return this.authService.oauthLogin(req.user, res);
  }
}
