import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Req,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseFilePipeBuilder,
  HttpStatus,
  Query,
  DefaultValuePipe,
  ParseIntPipe,
  Param,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ChefApplicationService } from './chef-application.service';
import { CreateChefApplicationDto } from './dto/create-chef-application.dto';
import { RejectApplicationDto } from './dto/reject-application.dto';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Role, Roles } from '../auth/roles.decorator';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import { Throttle } from '@nestjs/throttler';

type AuthRequest = Request & { user: { sub: string; role: string } };

@Controller('chef-applications')
export class ChefApplicationController {
  constructor(private readonly service: ChefApplicationService) {}

  /** Submit a new application — user role only */
  @Post()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.User)
  @UseInterceptors(FileInterceptor('kycDocument'))
  submit(
    @Req() req: AuthRequest,
    @Body() dto: CreateChefApplicationDto,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addMaxSizeValidator({
          maxSize: 5 * 1024 * 1024,
          message: 'KYC document must be under 5MB',
        })
        .build({
          fileIsRequired: true,
          errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        }),
    )
    kycFile: Express.Multer.File,
  ) {
    return this.service.submit(req.user.sub, dto, kycFile);
  }

  /** Get the calling user's own application */
  @Get('me')
  @UseGuards(AuthGuard)
  getMyApplication(@Req() req: AuthRequest) {
    return this.service.getMyApplication(req.user.sub);
  }

  /** Resubmit a rejected application — user role only */
  @Patch('me/resubmit')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.User)
  @UseInterceptors(FileInterceptor('kycDocument'))
  resubmit(
    @Req() req: AuthRequest,
    @Body() dto: CreateChefApplicationDto,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addMaxSizeValidator({
          maxSize: 5 * 1024 * 1024,
          message: 'KYC document must be under 5MB',
        })
        .build({
          fileIsRequired: false,
          errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        }),
    )
    kycFile?: Express.Multer.File,
  ) {
    return this.service.resubmit(req.user.sub, dto, kycFile);
  }

  /** Admin: list all applications */
  @Get()
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.Admin)
  findAll(
    @Query('status') status?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    return this.service.findAll(status, page, limit);
  }

  /** Admin: summary stats */
  @Get('stats')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.Admin)
  getStats() {
    return this.service.getStats();
  }

  /** Admin: single application */
  @Get(':id')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.Admin)
  findOne(@Param('id', ParseObjectIdPipe) id: string) {
    return this.service.findOne(id);
  }

  /** Admin: approve application */
  @Patch(':id/approve')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.Admin)
  approve(
    @Param('id', ParseObjectIdPipe) id: string,
    @Req() req: AuthRequest,
  ) {
    return this.service.approve(req.user.sub, id);
  }

  /** Admin: reject application with note */
  @Patch(':id/reject')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.Admin)
  reject(
    @Param('id', ParseObjectIdPipe) id: string,
    @Req() req: AuthRequest,
    @Body() dto: RejectApplicationDto,
  ) {
    return this.service.reject(req.user.sub, id, dto);
  }
}
