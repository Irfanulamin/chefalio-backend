import { BadRequestException, Injectable } from '@nestjs/common';
import { UserService } from 'src/user/user.service';
import { RegisterUserDto } from './dto/registerUser.dto';
import bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { LoginUserDto } from './dto/loginUser.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
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

  async userLogin(loginUserDto: LoginUserDto) {
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
}
