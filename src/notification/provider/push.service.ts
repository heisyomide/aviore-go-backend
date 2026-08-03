// src/notification/provider/push.service.ts
import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../providers/database/prisma.service';
import { JobCommGateway } from '../../communication/chat/chat.gateway';
import * as webpush from 'web-push';

@Injectable()
export class PushNotificationService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly jobCommGateway?: JobCommGateway,
  ) {
    const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
    const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
    const mailto = process.env.VAPID_MAILTO?.trim() || 'mailto:support@aviorego.com.ng';

    if (publicKey && privateKey) {
      webpush.setVapidDetails(mailto, publicKey, privateKey);
    } else {
      console.warn('[WebPush Warning] VAPID keys are missing from environment variables!');
    }
  }

  async sendPush(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, any>,
  ): Promise<any> {
    // 1. Persist notification in DB for In-App Notification Bell Center
    const notification = await this.prisma.notification.create({
      data: {
        userId,
        title,
        body,
        type: data?.type || 'SYSTEM_ALERT',
        data: data || {},
      },
    });

    // 2. Broadcast real-time over WebSockets (if user has app open)
    if (this.jobCommGateway && this.jobCommGateway.server) {
      this.jobCommGateway.server.to(`user_${userId}`).emit('new_notification', notification);
    }

    // 3. Dispatch actual Web Push to the user's physical device/browser
    try {
      const subscriptions = await this.prisma.pushSubscription.findMany({
        where: { userId },
      });

      if (!subscriptions || subscriptions.length === 0) {
        console.warn(`[WebPush Warning] No push subscriptions found in DB for user: ${userId}`);
        return notification;
      }

      const payload = JSON.stringify({
        title,
        body,
        icon: '/images/logo.png',
        url: data?.url || '/',
        data: data || {},
      });

      await Promise.all(
        subscriptions.map(async (sub) => {
          const pushSubscriptionObject = {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          };

          try {
            await webpush.sendNotification(pushSubscriptionObject, payload);
            console.log(`[WebPush Success] Sent to endpoint for user ${userId}`);
          } catch (err: any) {
            // Enhanced Diagnostic Logging
            console.error(`[WebPush Error Details] Status: ${err.statusCode} | Message: ${err.message}`);
            if (err.body) {
              console.error(`[WebPush Error Body]:`, err.body);
            }

            // If subscription is expired or invalid (410 / 404 / 403 / 400), clean it up
            if ([404, 410, 403, 400].includes(err.statusCode)) {
              await this.prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
              console.log(`[WebPush Cleanup] Removed invalid subscription ID: ${sub.id}`);
            }
          }
        }),
      );

      console.log(`[Push Alert Finished Processing] User: ${userId} | ${title}`);
    } catch (pushErr) {
      console.error('[Push Service Critical Error]:', pushErr);
    }

    return notification;
  }
}