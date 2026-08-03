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
    // Safely fallback across all possible property names from different strategies
    const userId = req.user?.id || req.user?.userId || req.user?.sub;

    if (!userId) {
      throw new BadRequestException('User context missing from authentication token');
    }

    if (!subscription || !subscription.endpoint || !subscription.keys) {
      throw new BadRequestException('Invalid subscription payload');
    }

    const { endpoint, keys } = subscription;

    try {
      const savedSubscription = await this.prisma.pushSubscription.upsert({
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

      console.log(`[Push Subscription Saved Successfully] User: ${userId}`);
      return { success: true, data: savedSubscription };
    } catch (err) {
      console.error('[Push Subscription DB Error]:', err);
      throw new BadRequestException('Failed to persist push subscription');
    }
  }
}
