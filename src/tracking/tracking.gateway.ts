import { 
  WebSocketGateway, 
  WebSocketServer, 
  OnGatewayConnection, 
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ShipmentsService } from '../shipments/shipment.service'; // Adjust path based on your folders

interface LocationPayload {
  shipmentId: string;
  latitude: number;
  longitude: number;
}

// Enable CORS so your Next.js frontend can connect smoothly
@WebSocketGateway({ cors: { origin: '*' } }) 
export class TrackingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  
  // NestJS will automatically inject the active socket server into this property
  @WebSocketServer()
  io!: Server;

  // Use NestJS dependency injection for your Database/Shipment services
  constructor(private readonly shipmentsService: ShipmentsService) {}

  handleConnection(socket: Socket) {
    console.log(`Socket client connected: ${socket.id}`);
  }

  handleDisconnect(socket: Socket) {
    console.log(`Socket client disconnected: ${socket.id}`);
  }

  // Listens for 'customer:joinShipment'
  @SubscribeMessage('customer:joinShipment')
  handleJoinShipment(
    @MessageBody() shipmentId: string,
    @ConnectedSocket() socket: Socket,
  ) {
    socket.join(`shipment:${shipmentId}`);
    console.log(`Client joined tracking monitor for shipment: ${shipmentId}`);
  }

  // Core Real-Time Geolocation Telemetry Pipe
  @SubscribeMessage('rider:updateLocation')
  async handleRiderLocationUpdate(
    @MessageBody() payload: LocationPayload,
    @ConnectedSocket() client: Socket,
  ) {
    const { shipmentId, latitude, longitude } = payload;
    if (!shipmentId || !latitude || !longitude) return;

    try {
      // 1. Persist the location state to the DB immediately via your service layer
      await this.shipmentsService.updateLiveLocation(shipmentId, latitude, longitude);

      // 2. Instantly broadcast the coordinate update to all clients in the room
      this.io.to(`shipment:${shipmentId}`).emit('tracking:update', {
        latitude: Number(latitude),
        longitude: Number(longitude),
      });
      
    } catch (error) {
      console.error(`Failed to update live coordinates for ${shipmentId}:`, error);
    }
  }

  // Listens for 'customer:leaveShipment'
  @SubscribeMessage('customer:leaveShipment')
  handleLeaveShipment(
    @MessageBody() shipmentId: string,
    @ConnectedSocket() socket: Socket,
  ) {
    socket.leave(`shipment:${shipmentId}`);
    console.log(`Client disconnected from shipment room: ${shipmentId}`);
  }
}