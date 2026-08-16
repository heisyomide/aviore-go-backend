import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../providers/database/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { AdminBroadcastDto } from './dto/broadcast.dto';
import { BroadcastChannel } from '../notification/dto/admin-broadcast.dto';
import { ChannelType, IdentityStatus } from '@prisma/client';

@Injectable()
export class AdminBroadcastService {
  private readonly logger = new Logger(AdminBroadcastService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Executes Admin-Only Multi-Channel Broadcast
   */
  async sendBroadcast(dto: AdminBroadcastDto, adminUserId: string) {
    const { title, body, targetAudience, channels } = dto;

    // 1. Build database filter targeting active accounts
    const whereClause: any = {
      status: {
        in: [IdentityStatus.VERIFIED, IdentityStatus.PENDING_VERIFICATION, 'PENDING_VERIFICATION' as any],
      },
    };

    if (targetAudience) {
      whereClause.role = targetAudience; // e.g., UserRole.ORGANIZER
    }

    // 2. Query target recipients
    const recipients = await this.prisma.user.findMany({
      where: whereClause,
      select: {
        id: true,
        email: true,
      },
    });

    if (!recipients.length) {
      throw new BadRequestException(
        `No eligible users found for target audience: ${targetAudience || 'GLOBAL_ALL'}`,
      );
    }

    const recipientUserIds = recipients.map((user) => user.id);
    const recipientEmails = recipients
      .map((user) => user.email)
      .filter((email): email is string => Boolean(email));

    const dispatchResults: Record<string, any> = {
      targetAudience: targetAudience || 'GLOBAL_ALL',
      recipientCount: recipients.length,
      channels,
    };

    // 3. PUSH: Dispatch to push notifications layer
    if (channels.includes(ChannelType.PUSH) && recipientUserIds.length) {
      dispatchResults.push = await this.notificationService.sendAdminBroadcast({
        title,
        body,
        channels: [BroadcastChannel.PUSH],
        recipientUserIds,
        recipientEmails: [],
      });
    }

    // 4. EMAIL: Dispatch to email provider layer
    if (channels.includes(ChannelType.EMAIL) && recipientEmails.length) {
      dispatchResults.email = await this.notificationService.sendAdminBroadcast({
        title,
        body,
        channels: [BroadcastChannel.EMAIL_BREVO],
        recipientEmails,
        recipientUserIds: [],
      });
    }

    // 5. IN-APP / SYSTEM: Create in-app notification rows so they appear on the user's /notifications page
    // (Uncomment if your schema has an in-app notification model like prisma.notification)
    /*
    await this.prisma.notification.createMany({
      data: recipientUserIds.map((userId) => ({
        userId,
        title,
        message: body,
        type: 'ADMIN',
        isRead: false,
      })),
    });
    */

    // 6. Record Audit Log entries in BroadcastLog
    await this.prisma.$transaction(
      channels.map((channel) =>
        this.prisma.broadcastLog.create({
          data: {
            title,
            body,
            targetAudience: targetAudience || null,
            channel,
            sentById: adminUserId,
          },
        }),
      ),
    );

    return dispatchResults;
  }
}