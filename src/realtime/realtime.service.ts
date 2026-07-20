import { Injectable } from '@nestjs/common';

import { ConnectedRider } from './interfaces/connected-rider.interface';
import { ConnectedCustomer } from './interfaces/connected-customer.interfaces';
import { GeoUtil } from './utils/geo.util';

@Injectable()
export class RealtimeService {
  /**
   * Online Riders
   */
  private readonly onlineRiders = new Map<
    string,
    ConnectedRider
  >();

  /**
   * Connected Customers
   */
  private readonly connectedCustomers = new Map<
    string,
    ConnectedCustomer
  >();

  /**
   * Customers currently tracking shipments
   *
   * shipmentId -> Set<customerId>
   */
  private readonly shipmentTracking = new Map<
    string,
    Set<string>
  >();

  /**
   * ============================
   * RIDERS
   * ============================
   */

  connectRider(rider: ConnectedRider) {
    this.onlineRiders.set(
      rider.userId,
      rider,
    );
  }

  riderOffline(userId: string) {
    this.onlineRiders.delete(userId);
  }

  getRider(userId: string) {
    return this.onlineRiders.get(userId);
  }

  getOnlineRiders() {
    return Array.from(
      this.onlineRiders.values(),
    );
  }

  updateLocation(
    userId: string,
    latitude: number,
    longitude: number,
    heading?: number,
    speed?: number,
    accuracy?: number,
  ) {
    const rider =
      this.onlineRiders.get(userId);

    if (!rider) return;

    rider.latitude = latitude;
    rider.longitude = longitude;
    rider.heading = heading;
    rider.speed = speed;
    rider.accuracy = accuracy;
    rider.lastSeen = new Date();

    this.onlineRiders.set(
      userId,
      rider,
    );
  }

  /**
   * ============================
   * CUSTOMERS
   * ============================
   */

  connectCustomer(
    customer: ConnectedCustomer,
  ) {
    this.connectedCustomers.set(
      customer.userId,
      customer,
    );
  }

  findRiderBySocketId(socketId: string) {
  return Array.from(
    this.onlineRiders.values(),
  ).find(
    (rider) => rider.socketId === socketId,
  );
}

findCustomerBySocketId(socketId: string) {
  return Array.from(
    this.connectedCustomers.values(),
  ).find(
    (customer) =>
      customer.socketId === socketId,
  );
}

  getCustomer(userId: string) {
    return this.connectedCustomers.get(
      userId,
    );
  }

  getCustomers() {
    return Array.from(
      this.connectedCustomers.values(),
    );
  }

  /**
   * ============================
   * SOCKET CLEANUP
   * ============================
   */

  removeSocket(socketId: string) {
    for (const [userId, rider] of this.onlineRiders) {
      if (rider.socketId === socketId) {
        this.onlineRiders.delete(userId);
        return;
      }
    }

    for (const [userId, customer] of this.connectedCustomers) {
      if (customer.socketId === socketId) {
        this.connectedCustomers.delete(userId);
        return;
      }
    }
  }

  /**
   * ============================
   * SHIPMENT TRACKING
   * ============================
   */

  startTracking(
    shipmentId: string,
    customerId: string,
  ) {
    if (
      !this.shipmentTracking.has(shipmentId)
    ) {
      this.shipmentTracking.set(
        shipmentId,
        new Set(),
      );
    }

    this.shipmentTracking
      .get(shipmentId)!
      .add(customerId);
  }

  stopTracking(
    shipmentId: string,
    customerId: string,
  ) {
    const tracking =
      this.shipmentTracking.get(shipmentId);

    if (!tracking) return;

    tracking.delete(customerId);

    if (tracking.size === 0) {
      this.shipmentTracking.delete(
        shipmentId,
      );
    }
  }

  getTrackingCustomers(
    shipmentId: string,
  ) {
    return (
      this.shipmentTracking.get(
        shipmentId,
      ) ?? new Set<string>()
    );
  }

  /**
 * Find nearby riders
 */
findNearbyRiders(
  latitude: number,
  longitude: number,
  radiusKm = 5,
) {
  return this.getOnlineRiders()

    // only online riders
    .filter(
      (rider) =>
        rider.isOnline &&
        rider.latitude != null &&
        rider.longitude != null,
    )

    // attach distance
    .map((rider) => ({
      rider,
      distance:
        GeoUtil.distanceInKm(
          latitude,
          longitude,
          rider.latitude!,
          rider.longitude!,
        ),
    }))

    // inside radius
    .filter(
      (item) =>
        item.distance <= radiusKm,
    )

    // nearest first
    .sort(
      (a, b) =>
        a.distance - b.distance,
    );
}

/**
 * Broadcast that a job has been taken
 */
broadcastJobTaken(
  shipmentId: string,
  acceptedRiderId: string,
) {
  for (const rider of this.onlineRiders.values()) {
    // Skip the rider who accepted the job
    if (rider.userId === acceptedRiderId) {
      continue;
    }

    rider.socket.emit(
      'dispatch:job-taken',
      {
        shipmentId,
      },
    );
  }
}
}