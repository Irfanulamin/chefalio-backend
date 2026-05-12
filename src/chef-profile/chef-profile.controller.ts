import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { ChefProfileService } from './chef-profile.service';
import { UpsertChefProfileDto } from './dto/upsert-chef-profile.dto';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles, Role } from '../auth/roles.decorator';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';

@Controller('chef-profile')
@UseGuards(AuthGuard)
export class ChefProfileController {
  constructor(private readonly chefProfileService: ChefProfileService) {}

  // GET /chef-profile/me — chef views their own profile (for pre-filling edit form)
  @Get('me')
  @UseGuards(RolesGuard)
  @Roles(Role.Chef)
  getMyProfile(@Req() req: Request & { user: { sub: string } }) {
    return this.chefProfileService.getChefProfile(req.user.sub);
  }

  // GET /chef-profile/:chefId — anyone with auth can view a chef's extended profile
  @Get(':chefId')
  getChefProfile(@Param('chefId', ParseObjectIdPipe) chefId: string) {
    return this.chefProfileService.getChefProfile(chefId);
  }

  // PATCH /chef-profile/me — chef upserts their own profile
  @Patch('me')
  @UseGuards(RolesGuard)
  @Roles(Role.Chef)
  upsertMyProfile(
    @Req() req: Request & { user: { sub: string } },
    @Body() dto: UpsertChefProfileDto,
  ) {
    return this.chefProfileService.upsertChefProfile(req.user.sub, dto);
  }
}
