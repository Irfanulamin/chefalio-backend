import {
  Controller,
  DefaultValuePipe,
  Get,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserService } from './user.service';
import { Role, Roles } from 'src/auth/roles.decorator';
import { AuthGuard } from 'src/auth/auth.guard';
import { RolesGuard } from 'src/auth/roles.guard';

@Controller('users')
export class UserController {
  constructor(private userService: UserService) {}

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @Get('all')
  getAllUsers(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('role') role?: 'user' | 'chef' | 'admin',
    @Query('search') search: string = '',
  ) {
    if (role && !['user', 'chef', 'admin'].includes(role)) {
      return {
        success: false,
        code: 400,
        message: 'Invalid role. Valid roles are user, chef, admin.',
      };
    }
    return this.userService.getAllUsers(page, limit, role, search);
  }
}
