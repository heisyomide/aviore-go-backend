import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ChatService } from './chat.service';
import { PrismaService } from '../../providers/database/prisma.service';
import { SenderRole } from '@prisma/client';

interface AuthenticatedSocket extends Socket {
  user?: {
    userId: string;
    role: string;
  };
}

@WebSocketGateway({
  namespace: '/job-comm',
  cors: { origin: '*', credentials: true },
})
export class JobCommGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private userSocketMap = new Map<string, string>();

  constructor(
    private jwtService: JwtService,
    private chatService: ChatService,
    private prisma: PrismaService,
  ) {}

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.split(' ')[1];

      if (!token) {
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token);
      client.user = { userId: payload.sub || payload.userId, role: payload.role };

      this.userSocketMap.set(client.user.userId, client.id);
      client.join(`user_${client.user.userId}`);
    } catch (err) {
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    if (client.user?.userId) {
      this.userSocketMap.delete(client.user.userId);
    }
  }

  @SubscribeMessage('join_job_room')
  async handleJoinJobRoom(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { jobId: string },
  ) {
    const userId = client.user?.userId;
    const userRole = client.user?.role;
    const { jobId } = data;

    if (!userId || !jobId) return;

    const shipment = await this.prisma.shipment.findUnique({
      where: { id: jobId },
      select: { customerId: true, riderId: true },
    });

    if (!shipment) {
      client.emit('exception', { message: 'Job not found' });
      return;
    }

    let isAssignedRider = false;
    if (userRole === 'RIDER') {
      const riderProfile = await this.prisma.riderProfile.findFirst({
        where: {
          OR: [{ id: userId }, { userId: userId }],
        },
      });

      if (riderProfile) {
        const assignment = await this.prisma.riderAssignment.findFirst({
          where: {
            shipmentId: jobId,
            riderId: riderProfile.id,
          },
        });
        isAssignedRider = !!assignment;
      }
    }

    const isAuthorized =
      userRole === 'ADMIN' ||
      shipment.customerId === userId ||
      shipment.riderId === userId ||
      isAssignedRider;

    if (!isAuthorized) {
      client.emit('exception', { message: 'Unauthorized access to job room' });
      return;
    }

    client.join(`job_${jobId}`);

    const history = await this.chatService.getChatHistory(jobId);
    client.emit('chat_history', history);
  }

  @SubscribeMessage('send_message')
  async handleSendMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { jobId: string; text: string },
  ) {
    const userId = client.user?.userId;
    const userRole = client.user?.role;
    const { jobId, text } = data;

    if (!userId || !text || !jobId) return;

    let senderRole: SenderRole = SenderRole.CUSTOMER;
    if (userRole === 'RIDER') senderRole = SenderRole.RIDER;
    if (userRole === 'ADMIN') senderRole = SenderRole.ADMIN;

    const savedMessage = await this.chatService.saveMessage({
      jobId,
      senderId: userId,
      senderRole,
      text,
    });

    // 1. Broadcast live message to active chat room
    this.server.to(`job_${jobId}`).emit('receive_message', savedMessage);

    // 2. Resolve recipient and trigger system notification pipeline (fixes mobile background delivery)
    const shipment = await this.prisma.shipment.findUnique({
      where: { id: jobId },
      select: { customerId: true, riderId: true },
    });

    if (shipment) {
      let recipientUserId: string | null = null;

      if (userId === shipment.customerId) {
        if (shipment.riderId) {
          recipientUserId = shipment.riderId;
        } else {
          const assignment = await this.prisma.riderAssignment.findFirst({
            where: { shipmentId: jobId },
          });
          if (assignment) recipientUserId = assignment.riderId;
        }
      } else {
        recipientUserId = shipment.customerId;
      }

      if (recipientUserId) {
        let targetAuthUserId = recipientUserId;
        const riderProfile = await this.prisma.riderProfile.findUnique({
          where: { id: recipientUserId },
          select: { userId: true },
        });
        if (riderProfile?.userId) {
          targetAuthUserId = riderProfile.userId;
        }

        // Emit socket socket notification
        this.server.to(`user_${targetAuthUserId}`).emit('new_chat_notification', {
          jobId,
          senderId: userId,
          text,
          timestamp: savedMessage.createdAt,
        });

        // Create persistent database notification so mobile OS push notification channels catch it like status updates
        try {
          await this.prisma.notification.create({
            data: {
              userId: targetAuthUserId,
              title: 'New Message',
              body: text,
              type: 'CHAT_MESSAGE',
              isRead: false,
            },
          });
        } catch (e) {
          // Fallback safely if schema table name differs
        }
      }
    }
  }

  // --- WebRTC Signaling Events ---

  @SubscribeMessage('call_user')
  async handleCallUser(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { jobId: string; recipientUserId: string; offer: any; callerName: string },
  ) {
    const callerId = client.user?.userId;
    if (!callerId) return;

    const recipientSocketId = this.userSocketMap.get(data.recipientUserId);
    if (recipientSocketId) {
      this.server.to(recipientSocketId).emit('incoming_call', {
        jobId: data.jobId,
        offer: data.offer,
        callerUserId: callerId,
        callerSocketId: client.id,
        callerName: data.callerName,
      });
    }
  }

  @SubscribeMessage('answer_call')
  handleAnswerCall(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { targetUserId: string; answer: any },
  ) {
    const responderId = client.user?.userId;
    const targetSocketId = this.userSocketMap.get(data.targetUserId);

    if (targetSocketId && responderId) {
      this.server.to(targetSocketId).emit('call_accepted', {
        answer: data.answer,
        responderUserId: responderId,
      });
    }
  }

  @SubscribeMessage('ice_candidate')
  handleIceCandidate(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { targetUserId: string; candidate: any },
  ) {
    const senderId = client.user?.userId;
    const targetSocketId = this.userSocketMap.get(data.targetUserId);

    if (targetSocketId && senderId) {
      this.server.to(targetSocketId).emit('ice_candidate', {
        candidate: data.candidate,
        senderUserId: senderId,
      });
    }
  }

  @SubscribeMessage('end_call')
  handleEndCall(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { targetUserId?: string; jobId: string },
  ) {
    const userId = client.user?.userId;
    if (data.targetUserId) {
      const targetSocketId = this.userSocketMap.get(data.targetUserId);
      if (targetSocketId) {
        this.server.to(targetSocketId).emit('call_ended');
      }
    }
    this.server.to(`job_${data.jobId}`).emit('call_ended');
  }
}