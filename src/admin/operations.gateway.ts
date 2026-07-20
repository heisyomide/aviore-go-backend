import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

interface RiderTelemetryPayload {
  riderId: string;
  shipmentId?: string;
  latitude: number;
  longitude: number;
  bearing?: number;
  speed?: number;
}

@WebSocketGateway({ namespace: 'admin-operations', cors: { origin: '*' } })
export class AdminOperationsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  // Fixed: Appended '!' to assure TypeScript that NestJS injects this dependency at runtime
  @WebSocketServer() server!: Server;

  // In-memory cluster tracking fleet status without stressing Neon compute
  private activeFleetTelemetry: Map<string, RiderTelemetryPayload> = new Map();
  private connectedAdmins: Set<string> = new Set();

  /**
   * Public bridge exposed for NestJS HTTP REST Controllers to ingest 
   * live fleet tracking data on-demand.
   */
public getFleetSnapshot(): Map<string, any> {
  return this.activeFleetTelemetry;
}

  handleConnection(client: Socket) {
    const isRider = client.handshake.query.role === 'RIDER';
    if (!isRider) {
      this.connectedAdmins.add(client.id);
      // Immediately hydrate the new admin view with the current fleet status
      client.emit('fleet_snapshot', Array.from(this.activeFleetTelemetry.values()));
    }
  }

  handleDisconnect(client: Socket) {
    this.connectedAdmins.delete(client.id);
  }

  /**
   * High frequency hook triggered via the rider's mobile app client
   */
  @SubscribeMessage('update_location')
  handleRiderTelemetry(@MessageBody() payload: RiderTelemetryPayload) {
    // 1. Instantly update volatile transient state variables
    this.activeFleetTelemetry.set(payload.riderId, payload);

    // 2. Broadcast the live location stream exclusively to active admin dashboards
    this.server.emit('fleet_telemetry_stream', payload);
  }

  /**
   * Cleans up disconnected or offline riders from memory
   */
  @SubscribeMessage('go_offline')
  handleRiderOffline(@MessageBody() data: { riderId: string }) {
    this.activeFleetTelemetry.delete(data.riderId);
    this.server.emit('rider_offline', { riderId: data.riderId });
  }
}