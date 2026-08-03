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
   * Generates a styled HTML email wrapper with CTA Button or PIN support
   */
  private buildEmailTemplate(
    title: string,
    body: string,
    actionUrl?: string,
    actionText?: string,
    pin?: string,
  ) {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${title}</title>
        </head>
        <body style="font-family: Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 40px 16px;">
          <div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; padding: 32px 24px; border: 1px solid #e2e8f0; text-align: center; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
            
            <!-- Branding Header -->
            <div style="margin-bottom: 24px;">
              <h2 style="color: #0f172a; font-size: 24px; font-weight: 800; margin: 0;">
                Aviorè <span style="background-color: #047857; color: #ffffff; padding: 2px 8px; border-radius: 10px; font-size: 12px; font-weight: bold; text-transform: uppercase;">Go</span>
              </h2>
            </div>

            <!-- Subject / Header -->
            <h1 style="color: #0f172a; font-size: 20px; font-weight: 800; margin-bottom: 12px;">
              ${title}
            </h1>
            
            <!-- Message Body -->
            <p style="color: #475569; font-size: 14px; line-height: 1.6; margin-bottom: 24px;">
              ${body}
            </p>

            ${
              pin
                ? `
              <div style="background-color: #f1f5f9; padding: 16px; border-radius: 12px; margin-bottom: 24px;">
                <span style="font-size: 12px; color: #64748b; font-weight: bold; text-transform: uppercase;">Verification PIN</span>
                <div style="font-size: 28px; font-weight: bold; color: #0f172a; letter-spacing: 4px; margin-top: 4px;">${pin}</div>
              </div>
            `
                : ''
            }

            ${
              actionUrl && actionText
                ? `
              <!-- CTA BUTTON WITH EMBEDDED TOKEN URL -->
              <div style="margin-bottom: 28px;">
                <a href="${actionUrl}" 
                   target="_blank" 
                   style="background-color: #047857; color: #ffffff; padding: 14px 28px; border-radius: 10px; font-weight: bold; font-size: 14px; text-decoration: none; display: inline-block; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                  ${actionText}
                </a>
              </div>
            `
                : ''
            }

            <p style="color: #94a3b8; font-size: 12px; line-height: 1.5; margin-top: 24px; border-top: 1px solid #f1f5f9; padding-top: 16px;">
              If you did not request this email, please ignore it or contact support.
            </p>
            
            <p style="color: #cbd5e1; font-size: 11px; margin-top: 8px;">
              &copy; ${new Date().getFullYear()} Aviorè Logistics. All rights reserved.
            </p>
          </div>
        </body>
      </html>
    `;
  }

  /**
   * Internal Event Dispatcher
   */
  /**
   * Internal Event Dispatcher
   */
  async dispatch(dto: SendNotificationDto): Promise<any> {
    const { type, userId, email, title, body, data } = dto;

    switch (type) {
      // 1. Priority Transactional (Resend Email)
      case NotificationType.ACCOUNT_WELCOME:
      case NotificationType.PASSWORD_RESET_OTP:
      case NotificationType.ESCROW_VERIFICATION_PIN: {
        if (!email) {
          throw new BadRequestException(`Email is required for notification type ${type}`);
        }

        const actionUrl = data?.url || data?.link;
        const actionText = data?.actionText || 'Confirm Email';
        const html = this.buildEmailTemplate(title, body, actionUrl, actionText, data?.pin);

        return this.resendService.sendPriorityEmail(email, title, html);
      }

      case NotificationType.PAYMENT_RECEIPT: {
        // Fallback: fetch user email from DB if not provided in DTO
        let targetEmail = email;
        if (!targetEmail && userId) {
          const user = await this.prisma.user.findUnique({ where: { id: userId } });
          targetEmail = user?.email || undefined;
        }

        if (!targetEmail) {
          console.warn(`[Notification Warning] Skipping payment email: No email found for user ${userId}`);
          // Still fallback to pushing an in-app alert so it doesn't crash the transaction
          if (userId) {
            return this.pushService.sendPush(userId, title, body, { ...data, type });
          }
          throw new BadRequestException(`Email is required for notification type ${type}`);
        }

        const html = this.buildEmailTemplate(title, body, data?.url, 'View Receipt', data?.pin);
        return this.resendService.sendPriorityEmail(targetEmail, title, html);
      }

      // 2. Real-Time System & Security Alerts (Push Only / Socket Emitted)
      case NotificationType.LOGIN_ALERT:
      case NotificationType.LOGOUT_ALERT:
      case NotificationType.RIDER_ASSIGNED:
      case NotificationType.ORDER_STATUS_UPDATE:
      case 'RIDER_ARRIVED_PICKUP' as any:
      case 'PACKAGE_IN_TRANSIT' as any:
      case 'ARRIVED_DESTINATION' as any:
      case 'DELIVERY_COMPLETED' as any:
      case 'WITHDRAWAL_UPDATE' as any:
      case 'SYSTEM_ALERT' as any: {
        if (!userId) {
          console.warn(`[Notification Warning] Push alert ${type} skipped: Missing userId`);
          return;
        }

        return this.pushService.sendPush(userId, title, body, { ...data, type });
      }

      // 3. System & Marketing Emails (Brevo)
      case NotificationType.MARKETING_PROMO:
      case NotificationType.SYSTEM_ANNOUNCEMENT: {
        if (!email) {
          throw new BadRequestException(`Email is required for broadcast ${type}`);
        }

        const html = this.buildEmailTemplate(title, body);
        return this.brevoService.sendBroadcastEmail([email], title, html);
      }

      default:
        // Graceful fallback instead of crashing with 400 BadRequest if an unmapped type occurs
        console.warn(`[Notification Warning] Unhandled notification type received: ${type}. Defaulting to Push/In-App.`);
        if (userId) {
          return this.pushService.sendPush(userId, title, body, { ...data, type });
        }
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
      const html = this.buildEmailTemplate(title, body);
      results.email = await this.brevoService.sendBroadcastEmail(
        recipientEmails,
        title,
        html,
      );
    }

    return results;
  }

  /**
   * Fetch In-App User Notifications
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