import { Socket } from 'socket.io';

export interface ConnectedCustomer {
  userId: string;

  socketId: string;

  socket: Socket;

  shipmentId?: string;

  lastSeen: Date;
}