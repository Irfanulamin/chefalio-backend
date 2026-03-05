import {
  Body,
  Controller,
  Get,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterUserDto } from './dto/registerUser.dto';
import { LoginUserDto } from './dto/loginUser.dto';
import { AuthGuard } from './auth.guard';
import { ForgotPasswordDto } from './dto/forgotPassword.dto';
import { ResetPasswordDto } from './dto/resetPassword.dto';
import { ChangePasswordDto } from './dto/changePassword.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('/register')
  async register(@Body() registerUserDto: RegisterUserDto) {
    return await this.authService.userRegister(registerUserDto);
  }

  @Post('/login')
  async login(@Body() loginUserDto: LoginUserDto) {
    return await this.authService.userLogin(loginUserDto);
  }

  @Post('/logout')
  async logout() {
    // Since JWT is stateless, we can't invalidate the token on the server side.
    // The client should simply delete the token on their end to "log out".
    return {
      success: true,
      stausCode: 200,
      message:
        'User logged out successfully. Please delete the token on the client side.',
    };
  }

  @UseGuards(AuthGuard)
  @Get('/profile')
  async getProfile(@Request() req) {
    const userId: string = req.user.sub;
    return await this.authService.getProfile(userId);
  }

  @Post('/forgot-password')
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return await this.authService.forgotPassword(forgotPasswordDto);
  }

  @Post('/reset-password')
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return await this.authService.resetPassword(resetPasswordDto);
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
}
