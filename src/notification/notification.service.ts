import {
  Injectable,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../providers/database/prisma.service';
import { ResendService } from './provider/resend.service';
import { BrevoService } from './provider/brevo.service';
import { PushNotificationService } from './provider/push.service';
import { SendNotificationDto, NotificationType } from './dto/send-notification.dto';
import { AdminBroadcastDto, BroadcastChannel } from './dto/admin-broadcast.dto';

@Injectable()
export class NotificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly resendService: ResendService,
    private readonly brevoService: BrevoService,
    private readonly pushService: PushNotificationService,
  ) {}

  /**
   * Internal Event Dispatcher
   */
  async dispatch(dto: SendNotificationDto): Promise<any> {
    const { type, userId, email, title, body, data } = dto;

    switch (type) {
      // 1. Priority Transactional (Resend Email)
      case NotificationType.ACCOUNT_WELCOME:
      case NotificationType.PASSWORD_RESET_OTP:
      case NotificationType.ESCROW_VERIFICATION_PIN:
      case NotificationType.PAYMENT_RECEIPT: {
        if (!email) {
          throw new BadRequestException(`Email is required for notification type ${type}`);
        }

        const html = `
          <div style="font-family: Arial, sans-serif; padding: 20px;">
            <h2>${title}</h2>
            <p>${body}</p>
            ${data?.pin ? `<h3>Your PIN: <strong>${data.pin}</strong></h3>` : ''}
          </div>
        `;

        return this.resendService.sendPriorityEmail(email, title, html);
      }

      // 2. Real-Time System & Security Alerts (Push Only)
      case NotificationType.LOGIN_ALERT:
      case NotificationType.LOGOUT_ALERT:
      case NotificationType.RIDER_ASSIGNED:
      case NotificationType.ORDER_STATUS_UPDATE: {
        if (!userId) {
          throw new BadRequestException(`UserId is required for push alert ${type}`);
        }

        return this.pushService.sendPush(userId, title, body, data);
      }

      // 3. System & Marketing Emails (Brevo)
      case NotificationType.MARKETING_PROMO:
      case NotificationType.SYSTEM_ANNOUNCEMENT: {
        if (!email) {
          throw new BadRequestException(`Email is required for broadcast ${type}`);
        }

        return this.brevoService.sendBroadcastEmail([email], title, `<p>${body}</p>`);
      }

      default:
        throw new BadRequestException(`Unsupported notification type: ${type}`);
    }
  }

  /**
   * Admin-Triggered Custom Broadcast
   */
  async sendAdminBroadcast(dto: AdminBroadcastDto): Promise<any> {
    const { title, body, channels, recipientEmails, recipientUserIds } = dto;
    const results: Record<string, any> = {};

    if (channels.includes(BroadcastChannel.PUSH) && recipientUserIds?.length) {
      results.push = await Promise.all(
        recipientUserIds.map((userId) =>
          this.pushService.sendPush(userId, title, body),
        ),
      );
    }

    if (channels.includes(BroadcastChannel.EMAIL_BREVO) && recipientEmails?.length) {
      results.email = await this.brevoService.sendBroadcastEmail(
        recipientEmails,
        title,
        `<div style="padding:20px;"><h2>${title}</h2><p>${body}</p></div>`,
      );
    }

    return results;
  }

  /**
   * Fetch In-App User Notifications (for Bell Dropdown / Inbox)
   */
  async getUserNotifications(userId: string): Promise<any> {
    const notifications = await this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    const unreadCount = await this.prisma.notification.count({
      where: { userId, isRead: false },
    });

    return { notifications, unreadCount };
  }

  /**
   * Mark Single Notification as Read
   */
  async markAsRead(userId: string, notificationId: string): Promise<any> {
    return this.prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { isRead: true },
    });
  }

  /**
   * Mark All Notifications as Read
   */
  async markAllAsRead(userId: string): Promise<any> {
    return this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
  }
}