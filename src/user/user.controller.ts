import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  HttpStatus,
  Param,
  ParseFilePipeBuilder,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { UserService } from './user.service';
import { Role, Roles } from '../auth/roles.decorator';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { FileInterceptor } from '@nestjs/platform-express';
import { UpdateUserDto } from './dto/UpdateUser.dto';
import { AdminUpdateUserDto } from './dto/AdminUpdateUser.dto';
import { CreateUserDto } from './dto/CreateUser.dto';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';

@Controller('users')
export class UserController {
  constructor(private userService: UserService) {}
  @Post('/create')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.Admin)
  createUser(@Body() dto: CreateUserDto) {
    return this.userService.createUserByAdmin(dto);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @Get('/all')
  getAllUsers(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('role') role?: 'user' | 'chef' | 'admin',
    @Query('search') search: string = '',
    @Query('isActive') isActiveStr?: string,
  ) {
    const isActive =
      isActiveStr === undefined ? undefined : isActiveStr === 'true';
    if (role && !['user', 'chef', 'admin'].includes(role)) {
      throw new BadRequestException('Invalid role filter');
    }
    return this.userService.getAllUsers(page, limit, role, search, isActive);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @Get('/dashboard/analytics')
  getUserAnalytics() {
    return this.userService.getUserAnalytics();
  }

  @Patch('/update/me')
  @UseGuards(AuthGuard)
  @UseInterceptors(FileInterceptor('image'))
  async updateOwnProfile(
    @Req() req: Request & { user: { sub: string } },
    @Body() dto: UpdateUserDto,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addMaxSizeValidator({
          maxSize: 5 * 1024 * 1024,
        })
        .build({
          fileIsRequired: false,
          errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        }),
    )
    image?: Express.Multer.File,
  ) {
    return this.userService.updateOwnProfile(req.user.sub, dto, image);
  }

  @Patch('/update/:id')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.Admin)
  adminUpdate(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: AdminUpdateUserDto,
  ) {
    return this.userService.updateUserByAdmin(id, dto);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @Get('/:id')
  getUser(@Param('id', ParseObjectIdPipe) id: string) {
    return this.userService.getUserById(id);
  }
}
