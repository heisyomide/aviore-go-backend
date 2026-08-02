// ==========================================
// 1. CHAT SERVICE (chat.service.ts)
// ==========================================
import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../providers/database/prisma.service'; // Adjust path if needed

export interface AuthenticatedUser {
  id: string;
  role: 'CUSTOMER' | 'RIDER' | 'ADMIN';
  email?: string;
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Verifies incoming WebSocket handshake JWT tokens.
   */
  async verifyToken(token: string): Promise<AuthenticatedUser> {
    try {
      const cleanToken = token.startsWith('Bearer ') ? token.slice(7) : token;
      const payload = await this.jwtService.verifyAsync(cleanToken);
      
      return {
        id: payload.id || payload.sub,
        role: payload.role,
        email: payload.email,
      };
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  /**
   * Verifies if a user has access to a specific job/shipment.
   */
  async isJobParticipant(jobId: string, userId: string, role: string): Promise<boolean> {
    if (role === 'ADMIN') return true;

    // Adjust queries below based on your actual Prisma Schema fields for Job/Shipment
    const job = await this.prisma.shipment.findUnique({
      where: { id: jobId },
      select: { customerId: true, riderId: true },
    });

    if (!job) return false;
    return job.customerId === userId || job.riderId === userId;
  }

  /**
   * Saves a message to the database.
   */
  async saveMessage(data: {
    jobId: string;
    senderId: string;
    senderRole: string;
    text: string;
  }) {
    return this.prisma.chatMessage.create({
      data: {
        jobId: data.jobId,
        senderId: data.senderId,
        senderRole: data.senderRole,
        text: data.text,
      },
    });
  }

  /**
   * Retrieves all previous messages for a specific shipment/job.
   */
  async getMessagesByJobId(jobId: string) {
    const messages = await this.prisma.chatMessage.findMany({
      where: { jobId },
      orderBy: { createdAt: 'asc' },
    });

    return messages.map((msg) => ({
      id: msg.id,
      jobId: msg.jobId,
      senderId: msg.senderId,
      senderRole: msg.senderRole as 'CUSTOMER' | 'RIDER' | 'ADMIN',
      text: msg.text,
      timestamp: msg.createdAt.toISOString(),
    }));
  }
}