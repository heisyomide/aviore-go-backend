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
    // Initialize web-push with your VAPID keys
    if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
      webpush.setVapidDetails(
        process.env.VAPID_MAILTO || 'mailto:support@aviorego.com.ng',
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY,
      );
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
      // Assuming you have a PushSubscription model stored in your database linked to the user
      const subscriptions = await this.prisma.pushSubscription.findMany({
        where: { userId },
      });

      const payload = JSON.stringify({
        title,
        body,
        icon: '/images/logo.png',
        data: data || {},
      });

      // Send to all registered devices/browsers for this user
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
          } catch (err: any) {
            // If subscription is expired or invalid (410 / 404), delete it from DB
            if (err.statusCode === 410 || err.statusCode === 404) {
              await this.prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
            } else {
              console.error('[WebPush Error] Failed to send to endpoint:', err.message);
            }
          }
        }),
      );

      console.log(`[Push Alert Sent to Phone] User: ${userId} | ${title}`);
    } catch (pushErr) {
      console.error('[Push Service Error] Failed to query or dispatch web push:', pushErr);
    }

    return notification;
  }
}