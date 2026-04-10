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
import type { Response } from 'express';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('/register')
  async register(
    @Body() registerUserDto: RegisterUserDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return await this.authService.userRegister(registerUserDto, res);
  }

  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @UseGuards(ThrottlerGuard)
  @Post('/login')
  async login(
    @Body() loginUserDto: LoginUserDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return await this.authService.userLogin(loginUserDto, res);
  }

  @UseGuards(AuthGuard)
  @Get('/me')
  getMe(@Request() req) {
    return { userId: req.user.sub, role: req.user.role };
  }

  @Post('/logout')
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('access_token');
    return {
      success: true,
      statusCode: 200,
      message:
        'User logged out successfully. Please delete the token on the client side.',
    };
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
  @UseGuards(ThrottlerGuard)
  @Post('/forgot-password')
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return await this.authService.forgotPassword(forgotPasswordDto);
  }

  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @UseGuards(ThrottlerGuard)
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
}
