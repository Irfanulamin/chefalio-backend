import { Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { FollowService } from './follow.service';
import { AuthGuard } from '../auth/auth.guard';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';

type AuthRequest = Request & { user: { sub: string; role: string } };

@Controller('follows')
@UseGuards(AuthGuard)
export class FollowController {
  constructor(private readonly followService: FollowService) {}

  // GET /follows — chef ids the current user follows
  @Get()
  getMyFollowing(@Req() req: AuthRequest) {
    return this.followService.getMyFollowing(req.user.sub);
  }

  // GET /follows/:chefId — { isFollowing, followerCount } for one chef
  @Get(':chefId')
  getStatus(
    @Req() req: AuthRequest,
    @Param('chefId', ParseObjectIdPipe) chefId: string,
  ) {
    return this.followService.getStatus(req.user.sub, chefId);
  }

  // POST /follows/:chefId
  @Post(':chefId')
  follow(
    @Req() req: AuthRequest,
    @Param('chefId', ParseObjectIdPipe) chefId: string,
  ) {
    return this.followService.follow(req.user.sub, chefId);
  }

  // DELETE /follows/:chefId
  @Delete(':chefId')
  unfollow(
    @Req() req: AuthRequest,
    @Param('chefId', ParseObjectIdPipe) chefId: string,
  ) {
    return this.followService.unfollow(req.user.sub, chefId);
  }
}
