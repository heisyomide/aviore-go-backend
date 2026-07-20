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
import { PrismaService } from '../providers/database/prisma.service';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: 'telemetry',
})
export class ShipmentsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server; // ⚠️ Fixed: Added '!' to tell TS it will be assigned at runtime by NestJS

  private readonly logger = new Logger(ShipmentsGateway.name);

  constructor(private readonly prisma: PrismaService) {}

  handleConnection(client: Socket) {
    const { shipmentId, role } = client.handshake.query;
    if (shipmentId) {
      client.join(`shipment:${shipmentId}`);
      this.logger.log(`Client connected as ${role} to tracking room: shipment:${shipmentId}`);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected from telemetry gateway: ${client.id}`);
  }

  /**
   * High-frequency telemetry channel for active riders delivering a package
   */
  @SubscribeMessage('pingLocation')
  async handleLocationPing(
    @MessageBody() data: { shipmentId: string; latitude: number; longitude: number; bearing?: number },
    @ConnectedSocket() client: Socket
  ) {
    // 1. Fire-and-forget broadcast to connected customers/vendors instantly
    client.to(`shipment:${data.shipmentId}`).emit('locationUpdate', {
      latitude: data.latitude,
      longitude: data.longitude,
      bearing: data.bearing || 0,
      timestamp: new Date(),
    });

    // 2. Persist the log inside the database asynchronously
    try {
      await this.prisma.trackingLog.create({
        data: {
          shipmentId: data.shipmentId,
          latitude: data.latitude,
          longitude: data.longitude,
          bearing: data.bearing || null,
        },
      });
    } catch (error: unknown) {
      // ⚠️ Fixed: Safely extract error stack trace with fallback
      const errorStack = error instanceof Error ? error.stack : String(error);
      this.logger.error(`Failed to record tracking log for ${data.shipmentId}`, errorStack);
    }
  }
}