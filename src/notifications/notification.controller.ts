import { Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { AuthGuard } from '../auth/auth.guard';

@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  @UseGuards(AuthGuard)
  async getNotifications(@Req() req: Request & { user: { sub: string } }) {
    const [notifications, lastReadAt] = await Promise.all([
      this.notificationService.getRecent(),
      this.notificationService.getUserLastReadAt(req.user.sub),
    ]);
    return { success: true, data: notifications, lastReadAt };
  }

  @Patch('mark-read')
  @UseGuards(AuthGuard)
  async markAllRead(@Req() req: Request & { user: { sub: string } }) {
    await this.notificationService.markAllRead(req.user.sub);
    return { success: true, message: 'Notifications marked as read' };
  }
}
