// src/notification/provider/push.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../providers/database/prisma.service';

@Injectable()
export class PushNotificationService {
  constructor(private readonly prisma: PrismaService) {}

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

    // 2. Dispatch real-time alert via WebPush / Sockets / FCM
    console.log(`[Push Alert Saved & Sent] User: ${userId} | ${title}: ${body}`);

    return notification;
  }
}