import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,Req,
  BadRequestException,
} from '@nestjs/common';
import { NotificationService } from './notification.service';
import { SendNotificationDto } from './dto/send-notification.dto';
import { AdminBroadcastDto } from './dto/admin-broadcast.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { PrismaService } from '../providers/database/prisma.service';


@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationController {
  constructor(private readonly notificationService: NotificationService,
    private readonly prisma: PrismaService
  ) {}

  @Post('send')
  sendNotification(@Body() dto: SendNotificationDto): Promise<any> {
    return this.notificationService.dispatch(dto);
  }

  @Post('admin/broadcast')
  sendBroadcast(@Body() dto: AdminBroadcastDto): Promise<any> {
    return this.notificationService.sendAdminBroadcast(dto);
  }

  @Get('my-notifications')
  getUserNotifications(@GetUser() user: any): Promise<any> {
    return this.notificationService.getUserNotifications(user.userId);
  }

  @Patch(':id/read')
  markAsRead(
    @GetUser() user: any,
    @Param('id') notificationId: string,
  ): Promise<any> {
    return this.notificationService.markAsRead(user.userId, notificationId);
  }

  @Patch('read-all')
  markAllAsRead(@GetUser() user: any): Promise<any> {
    return this.notificationService.markAllAsRead(user.userId);
  }



  @Post('subscribe')
  @UseGuards(JwtAuthGuard)
  async savePushSubscription(@Req() req: any, @Body() subscription: any) {
    const userId = req.user.id; // Adjust based on how your auth strategy attaches the user

    if (!subscription || !subscription.endpoint) {
      throw new BadRequestException('Invalid subscription payload');
    }

    const { endpoint, keys } = subscription;

    // Upsert the subscription so the same browser/device updates cleanly instead of duplicating
    return this.prisma.pushSubscription.upsert({
      where: { endpoint },
      update: {
        userId,
        p256dh: keys.p256dh,
        auth: keys.auth,
      },
      create: {
        userId,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
      },
    });
  }
}
