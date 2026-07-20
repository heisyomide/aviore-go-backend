import { Socket } from 'socket.io';

export interface ConnectedRider {
  userId: string;

  socketId: string;

  socket: Socket;

  latitude?: number;

  longitude?: number;

  heading?: number;

  speed?: number;

  accuracy?: number;

  lastSeen: Date;

  isOnline: boolean;
}