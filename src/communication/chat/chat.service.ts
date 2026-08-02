import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../providers/database/prisma.service';
import { SenderRole, MessageType } from '@prisma/client';

@Injectable()
export class ChatService {
  constructor(private prisma: PrismaService) {}

  async saveMessage(data: {
    jobId: string;
    senderId: string;
    senderRole: SenderRole;
    text: string;
    messageType?: MessageType;
  }) {
    return this.prisma.chatMessage.create({
      data: {
        jobId: data.jobId,
        senderId: data.senderId,
        senderRole: data.senderRole,
        text: data.text,
        messageType: data.messageType || MessageType.TEXT,
      },
    });
  }

  async getChatHistory(jobId: string) {
    return this.prisma.chatMessage.findMany({
      where: { jobId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async markMessagesAsRead(jobId: string, userId: string) {
    return this.prisma.chatMessage.updateMany({
      where: {
        jobId,
        senderId: { not: userId },
        isRead: false,
      },
      data: { isRead: true },
    });
  }
}