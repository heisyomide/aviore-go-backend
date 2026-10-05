import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../providers/database/prisma.service';
import { PushNotificationService } from '../notification/provider/push.service';

@Injectable()
export class EngagementService {
  private readonly logger = new Logger(EngagementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pushService: PushNotificationService,
  ) {}

  /**
   * Cron job runs every minute to check and trigger scheduled notification campaigns
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async handleScheduledCampaigns() {
    const now = new Date();
    const currentTime = now.toTimeString().slice(0, 5); // "HH:mm" format
    const todayStr = now.toISOString().split('T')[0];
    const today = new Date(todayStr);

    try {
      // Find active campaigns matching the current scheduled time
      const campaigns = await this.prisma.notificationCampaign.findMany({
        where: {
          isActive: true,
          scheduledTime: currentTime,
          startDate: { lte: now },
          OR: [
            { endDate: null },
            { endDate: { gte: today } }
          ],
        },
      });

      if (campaigns.length === 0) return;

      for (const campaign of campaigns) {
        await this.dispatchCampaign(campaign);
      }
    } catch (err) {
      this.logger.error('[Engagement Engine Error] Failed to process scheduled campaigns:', err);
    }
  }

  /**
   * Dispatches a campaign to its target audience using push subscriptions
   */
  private async dispatchCampaign(campaign: any) {
    try {
      // Build user filter based on audience role
      let userQuery: any = {
        status: { in: ['VERIFIED', 'PENDING_VERIFICATION'] },
      };

      if (campaign.audience && campaign.audience !== 'ALL') {
        userQuery.role = campaign.audience;
      }

      const users = await this.prisma.user.findMany({
        where: userQuery,
        select: { id: true },
      });

      if (users.length === 0) {
        this.logger.warn(`[Campaign] No target users found for campaign: ${campaign.title}`);
        return;
      }

      let successCount = 0;

      // Dispatch push alert to each targeted user via your PushNotificationService
      for (const user of users) {
        try {
          await this.pushService.sendPush(
            user.id,
            campaign.title,
            campaign.body,
            {
              type: 'MARKETING_PROMO',
              category: campaign.category,
              campaignId: campaign.id,
              url: 'https://app.aviorego.com.ng/dashboard',
            },
          );
          successCount++;
        } catch (pushErr) {
          // Individual push failure handled inside push service, continue loop
        }
      }

      // Increment campaign sent analytics
      await this.prisma.notificationCampaign.update({
        where: { id: campaign.id },
        data: { sentCount: { increment: successCount } },
      });

      this.logger.log(`[Engagement Engine] Campaign "${campaign.title}" successfully dispatched to ${successCount} users.`);
    } catch (error) {
      this.logger.error(`[Campaign Dispatch Error] ID ${campaign.id}:`, error);
    }
  }
}