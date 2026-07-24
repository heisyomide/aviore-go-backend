import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { NotificationService } from './notification.service';
import { SendNotificationDto } from './dto/send-notification.dto';
import { AdminBroadcastDto } from './dto/admin-broadcast.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

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
}