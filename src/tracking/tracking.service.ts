import { Injectable } from "@nestjs/common";
import { TrackingStore } from "./store/tracking.store";
import { LiveLocation } from "./interfaces/live-location.interface";
import { AdminOperationsGateway } from "src/admin/operations.gateway";
import { PrismaService } from '../providers/database/prisma.service';

@Injectable()
export class TrackingService {
  constructor(
    private readonly store: TrackingStore,
    private readonly operationsGateway: AdminOperationsGateway,
    private readonly prisma: PrismaService,
  ) {}

  updateLocation(location: LiveLocation) {
    this.store.set({
      ...location,
      updatedAt: Date.now(),
    });
  }

  getLocation(riderId: string) {
    return this.store.get(riderId);
  }

  removeRider(riderId: string) {
    this.store.remove(riderId);
  }

  getAllLocations() {
    return this.store.getAll();
  }

  hasLocation(riderId: string) {
    return this.store.has(riderId);
  }

  async getLiveFleetData() {
  // 1. Gather high-frequency tracking records currently stored in WebSocket memory
  const activeTelemetryMap = this.operationsGateway.getFleetSnapshot();

  // 2. Fetch ANY rider profile marked online in the database OR found in live telemetry
  const realRiders = await this.prisma.riderProfile.findMany({
    where: {
      OR: [
        { isOnline: true }, // Pulls the active state directly from your persistent DB layer
        { id: { in: Array.from(activeTelemetryMap.keys()) } }
      ]
    },
    include: {
      user: {
        select: {
          firstName: true,
          lastName: true,
          phoneNumber: true,
        },
      },
      shipments: {
        where: {
          status: { in: ['ACCEPTED', 'PICKED_UP', 'IN_TRANSIT'] },
        },
        select: {
          status: true,
        },
        take: 1,
      },
    },
  });

  // If there are truly no matching rows found across both layers, return an empty tracking map cleanly
  if (realRiders.length === 0) {
    return [];
  }

  // 3. Assemble fleet telemetry objects back to the administrative map interface
  return realRiders.map((rider: any) => {
    const telemetry = activeTelemetryMap.get(rider.id);
    const activeShipment = rider.shipments?.[0];

    let dynamicStatus: 'PICKUP' | 'DELIVERY' | 'IDLE' = 'IDLE';
    if (activeShipment) {
      dynamicStatus = activeShipment.status === 'ACCEPTED' ? 'PICKUP' : 'DELIVERY';
    }

    return {
      id: rider.id,
      status: dynamicStatus,
      // Fallback hierarchy: 1. Live WebSocket Telemetry -> 2. Last Saved DB Location -> 3. Standard Center Coordinates
      latitude: telemetry?.latitude || rider.lastLatitude || 6.5244, 
      longitude: telemetry?.longitude || rider.lastLongitude || 3.3792,
      user: {
        firstName: rider.user?.firstName || 'Rider',
        lastName: rider.user?.lastName || rider.id.slice(-4).toUpperCase(),
        phone: rider.user?.phoneNumber || '',
      },
    };
  });
}
}