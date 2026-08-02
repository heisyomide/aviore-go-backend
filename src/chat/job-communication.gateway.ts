// ==========================================
// 2. JOB COMMUNICATION GATEWAY (job-comm.gateway.ts)
// ==========================================
import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { ChatService, AuthenticatedUser } from '../chat/chat.service';

interface CustomSocket extends Socket {
  data: {
    user?: AuthenticatedUser;
    activeJobId?: string;
  };
}

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: 'job-comm',
})
export class JobCommunicationGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(JobCommunicationGateway.name);

  constructor(private readonly chatService: ChatService) {}

  /**
   * Handles incoming socket connections & authentication.
   */
  async handleConnection(client: CustomSocket) {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization;

      if (!token) {
        throw new WsException('Missing authorization token');
      }

      const user = await this.chatService.verifyToken(token);
      client.data.user = user;

      // Join a private personal room for direct WebRTC calling & notifications
      client.join(`user_${user.id}`);

      this.logger.log(`Client Connected: ${client.id} (User: ${user.id})`);
    } catch (error: any) {
      this.logger.warn(`Connection Rejected (${client.id}): ${error.message}`);
      client.emit('error', { message: 'Authentication failed' });
      client.disconnect();
    }
  }

  handleDisconnect(client: CustomSocket) {
    this.logger.log(`Client Disconnected: ${client.id}`);
  }

  // --- ROOM MANAGEMENT ---

  @SubscribeMessage('join_job_room')
  async handleJoinRoom(
    @ConnectedSocket() client: CustomSocket,
    @MessageBody() data: { jobId: string },
  ) {
    const user = client.data.user;
    if (!user) throw new WsException('Unauthorized');

    const isAuthorized = await this.chatService.isJobParticipant(
      data.jobId,
      user.id,
      user.role,
    );

    if (!isAuthorized) {
      throw new WsException('Forbidden: You are not assigned to this job');
    }

    const roomName = `job_${data.jobId}`;
    client.join(roomName);
    client.data.activeJobId = data.jobId;

    // 1. Notify other users in the job room
    client.to(roomName).emit('user_joined_room', {
      userId: user.id,
      role: user.role,
    });

    // 2. Load & return past chat history to the joining client
    try {
      const chatHistory = await this.chatService.getMessagesByJobId(data.jobId);
      client.emit('chat_history', chatHistory);
    } catch (error) {
      this.logger.error(`Failed to load chat history for job ${data.jobId}`, error);
      client.emit('chat_error', { message: 'Failed to retrieve message history' });
    }

    return { status: 'joined', room: roomName };
  }

  // --- LIVE CHAT ---

  @SubscribeMessage('send_message')
  async handleSendMessage(
    @ConnectedSocket() client: CustomSocket,
    @MessageBody() data: { jobId: string; text: string },
  ) {
    const user = client.data.user;
    if (!user) throw new WsException('Unauthorized');

    if (!data.text || !data.text.trim()) {
      return { status: 'error', message: 'Message content cannot be empty' };
    }

    const isAuthorized = await this.chatService.isJobParticipant(
      data.jobId,
      user.id,
      user.role,
    );
    if (!isAuthorized) {
      throw new WsException('Forbidden: Cannot send messages to this job');
    }

    const roomName = `job_${data.jobId}`;

    try {
      // 1. Save message to database
      const savedMsg = await this.chatService.saveMessage({
        jobId: data.jobId,
        senderId: user.id,
        senderRole: user.role,
        text: data.text.trim(),
      });

      const messagePayload = {
        id: savedMsg.id,
        jobId: savedMsg.jobId,
        senderId: savedMsg.senderId,
        senderRole: savedMsg.senderRole,
        text: savedMsg.text,
        timestamp: savedMsg.createdAt.toISOString(),
      };

      // 2. Broadcast stored message to everyone in the job room
      this.server.to(roomName).emit('receive_message', messagePayload);

      return { status: 'sent', messageId: savedMsg.id };
    } catch (error: any) {
      this.logger.error(`Failed to save chat message: ${error.message}`);
      return { status: 'error', message: 'Failed to deliver message' };
    }
  }

  // --- WEBRTC AUDIO CALL SIGNALING ---

  @SubscribeMessage('call_user')
  async handleCallUser(
    @ConnectedSocket() client: CustomSocket,
    @MessageBody() data: {
      jobId: string;
      recipientUserId: string;
      offer: any;
      callerName: string;
    },
  ) {
    const user = client.data.user;
    if (!user) throw new WsException('Unauthorized');

    // Route incoming call signal directly to recipient's private personal room
    this.server.to(`user_${data.recipientUserId}`).emit('incoming_call', {
      jobId: data.jobId,
      offer: data.offer,
      callerUserId: user.id,
      callerSocketId: client.id,
      callerName: data.callerName,
    });
  }

  @SubscribeMessage('answer_call')
  handleAnswerCall(
    @ConnectedSocket() client: CustomSocket,
    @MessageBody() data: { targetUserId: string; answer: any },
  ) {
    const user = client.data.user;
    if (!user) throw new WsException('Unauthorized');

    this.server.to(`user_${data.targetUserId}`).emit('call_accepted', {
      answer: data.answer,
      responderUserId: user.id,
      responderSocketId: client.id,
    });
  }

  @SubscribeMessage('ice_candidate')
  handleIceCandidate(
    @ConnectedSocket() client: CustomSocket,
    @MessageBody() data: { targetUserId: string; candidate: any },
  ) {
    if (!client.data.user) throw new WsException('Unauthorized');

    this.server.to(`user_${data.targetUserId}`).emit('ice_candidate', {
      candidate: data.candidate,
      senderUserId: client.data.user.id,
    });
  }

  @SubscribeMessage('end_call')
  handleEndCall(
    @ConnectedSocket() client: CustomSocket,
    @MessageBody() data: { targetUserId?: string; jobId?: string },
  ) {
    if (data.targetUserId) {
      this.server.to(`user_${data.targetUserId}`).emit('call_ended');
    } else if (data.jobId) {
      this.server.to(`job_${data.jobId}`).emit('call_ended');
    }
  }
}