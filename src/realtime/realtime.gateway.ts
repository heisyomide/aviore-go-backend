import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';

import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';

import { RealtimeService } from './realtime.service';
import { SocketAuthDto } from './dto/socket-auth.dto';
import { UpdateLocationDto } from './dto/update-location.dto';

@WebSocketGateway({
  namespace: '/realtime',
  cors: {
    origin: '*',
  },
})
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  constructor(
    private readonly realtimeService: RealtimeService,
    private readonly jwtService: JwtService,
  ) {}

  @WebSocketServer()
  server!: Server;

  handleConnection(socket: Socket) {
    console.log(`Socket Connected: ${socket.id}`);
  }

  handleDisconnect(socket: Socket) {
    this.realtimeService.removeSocket(socket.id);

    console.log(`Socket Disconnected: ${socket.id}`);
  }

  /**
   * Rider Connect
   */
  @SubscribeMessage('rider:connect')
  connectRider(
    @MessageBody() dto: SocketAuthDto,
    @ConnectedSocket() socket: Socket,
  ) {
    const payload = this.jwtService.verify(dto.token);

    this.realtimeService.connectRider({
      userId: payload.sub,
      socketId: socket.id,
      socket,
      latitude: 0,
      longitude: 0,
      heading: 0,
      speed: 0,
      accuracy: 0,
      lastSeen: new Date(),
      isOnline: true,
    });

    return {
      success: true,
    };
  }

  /**
   * Customer Connect
   */
  @SubscribeMessage('customer:connect')
  connectCustomer(
    @MessageBody() dto: SocketAuthDto,
    @ConnectedSocket() socket: Socket,
  ) {
    const payload = this.jwtService.verify(dto.token);

    this.realtimeService.connectCustomer({
      userId: payload.sub,
      socketId: socket.id,
      socket,
      lastSeen: new Date(),
    });

    return {
      success: true,
    };
  }

  /**
   * Rider GPS Update
   */
  @SubscribeMessage('rider:update-location')
  updateLocation(
    @MessageBody() dto: UpdateLocationDto,
    @ConnectedSocket() socket: Socket,
  ) {
    const rider =
      this.realtimeService.findRiderBySocketId(
        socket.id,
      );

    if (!rider) {
      return;
    }

    this.realtimeService.updateLocation(
      rider.userId,
      dto.latitude,
      dto.longitude,
      dto.heading,
      dto.speed,
    );

    return {
      success: true,
    };
  }

  /**
   * Rider Offline
   */
  @SubscribeMessage('rider:offline')
  riderOffline(
    @ConnectedSocket() socket: Socket,
  ) {
    const rider =
      this.realtimeService.findRiderBySocketId(
        socket.id,
      );

    if (!rider) {
      return;
    }

    this.realtimeService.riderOffline(
      rider.userId,
    );

    return {
      success: true,
    };
  }

  /**
   * Customer Starts Tracking
   */
  @SubscribeMessage('customer:start-tracking')
  startTracking(
    @MessageBody()
    data: {
      shipmentId: string;
    },
    @ConnectedSocket() socket: Socket,
  ) {
    const customer =
      this.realtimeService.findCustomerBySocketId(
        socket.id,
      );

    if (!customer) {
      return;
    }

    this.realtimeService.startTracking(
      data.shipmentId,
      customer.userId,
    );

    return {
      success: true,
    };
  }

  /**
   * Customer Stops Tracking
   */
  @SubscribeMessage('customer:stop-tracking')
  stopTracking(
    @MessageBody()
    data: {
      shipmentId: string;
    },
    @ConnectedSocket() socket: Socket,
  ) {
    const customer =
      this.realtimeService.findCustomerBySocketId(
        socket.id,
      );

    if (!customer) {
      return;
    }

    this.realtimeService.stopTracking(
      data.shipmentId,
      customer.userId,
    );

    return {
      success: true,
    };
  }
}