// src/notification/provider/push.service.ts
import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../providers/database/prisma.service';
import { JobCommGateway } from '../../communication/chat/chat.gateway'; // Adjust path if needed

@Injectable()
export class PushNotificationService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly jobCommGateway?: JobCommGateway,
  ) {}

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

    // 2. BROADCAST REAL-TIME ALERT VIA SOCKET.IO TO USER'S PRIVATE ROOM
    if (this.jobCommGateway && this.jobCommGateway.server) {
      this.jobCommGateway.server.to(`user_${userId}`).emit('new_notification', notification);
    }

    console.log(`[Push Alert Saved & Socket Emitted] User: ${userId} | ${title}: ${body}`);

    return notification;
  }
}