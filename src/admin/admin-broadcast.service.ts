import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../providers/database/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { AdminBroadcastDto } from './dto/broadcast.dto';
import { BroadcastChannel } from '../notification/dto/admin-broadcast.dto';
import { ChannelType, IdentityStatus, Prisma } from '@prisma/client';

@Injectable()
export class AdminBroadcastService {
  private readonly logger = new Logger(AdminBroadcastService.name);

  private static readonly ROLE_MAP: Record<string, string> = {
    CUSTOMERS: 'CUSTOMER',
    RIDERS: 'RIDER',
    ORGANIZERS: 'ORGANIZER',
    MERCHANTS: 'MERCHANT',
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Executes Admin-Only Multi-Channel Broadcast
   */
  async sendBroadcast(dto: AdminBroadcastDto, adminUserId: string) {
    const { title, body, targetAudience, channels } = dto;

    const roleFilter = targetAudience
      ? AdminBroadcastService.ROLE_MAP[targetAudience] ?? targetAudience
      : undefined;

    const whereClause: Prisma.UserWhereInput = {
      status: {
        in: [IdentityStatus.VERIFIED, IdentityStatus.PENDING_VERIFICATION],
      },
      ...(roleFilter ? { role: roleFilter as any } : {}),
    };

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

    // 5. Record Audit Log entries in BroadcastLog using createMany (fixes P2028 transaction timeout)
    if (channels.length > 0) {
      await this.prisma.broadcastLog.createMany({
        data: channels.map((channel) => ({
          title,
          body,
          targetAudience: targetAudience || null,
          channel,
          sentById: adminUserId,
        })),
      });
    }

    return dispatchResults;
  }
}