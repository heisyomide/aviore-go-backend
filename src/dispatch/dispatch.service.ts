// src/dispatch/dispatch.service.ts

import {
  Injectable,
  Logger,
} from '@nestjs/common';

import { Shipment } from '@prisma/client';

import { RealtimeService } from '../realtime/realtime.service';
import { ConnectedRider } from '../realtime/interfaces/connected-rider.interface';

@Injectable()
export class DispatchService {
  private readonly logger = new Logger(
    DispatchService.name,
  );

  private readonly reservationLocks = new Map<

    string,

    string

  >();

  /**

   * shipmentId -> timeout

   */

  private readonly reservationTimers = new Map<

    string,

    NodeJS.Timeout

  >();

  constructor(
    private readonly realtimeService: RealtimeService,
    
  ) {}

  /**
   * Dispatch Shipment
   */
  async dispatchShipment(
    shipment: Shipment,
  ): Promise<void> {
    this.logger.log(
      `Dispatching shipment ${shipment.id}`,
    );

    const nearbyRiders =
      this.findNearbyRiders(shipment);

    if (!nearbyRiders.length) {
      this.logger.warn(
        'No nearby riders found.',
      );
      return;
    }

    const rankedRiders =
      this.rankNearbyRiders(
        shipment,
        nearbyRiders,
      );

    await this.notifyNearbyRiders(
      shipment,
      rankedRiders,
    );
  }

  /**

   * ====================================

   * Reservation Locking

   * ====================================

   */

  reserveShipment(

    shipmentId: string,

    riderUserId: string,

  ): boolean {

    if (

      this.reservationLocks.has(

        shipmentId,

      )

    ) {

      return false;

    }

    this.reservationLocks.set(

      shipmentId,

      riderUserId,

    );

    const timer = setTimeout(() => {

      this.releaseReservation(

        shipmentId,

      );

    }, 20000);

    this.reservationTimers.set(

      shipmentId,

      timer,

    );

    this.logger.log(

      `Shipment ${shipmentId} reserved for rider ${riderUserId}`,

    );

    return true;

  }

  releaseReservation(

    shipmentId: string,

  ) {

    this.reservationLocks.delete(

      shipmentId,

    );

    const timer =

      this.reservationTimers.get(

        shipmentId,

      );

    if (timer) {

      clearTimeout(timer);

      this.reservationTimers.delete(

        shipmentId,

      );

    }

    this.logger.log(

      `Reservation released for shipment ${shipmentId}`,

    );

  }

  hasReservation(

    shipmentId: string,

    riderUserId: string,

  ): boolean {

    return (

      this.reservationLocks.get(

        shipmentId,

      ) === riderUserId

    );

  }

  /**
   * Find Nearby Riders
   */
  private findNearbyRiders(
    shipment: Shipment,
  ): ConnectedRider[] {
    return this.realtimeService
      .getOnlineRiders()
      .filter((rider) => {
        return (
          rider.isOnline &&
          rider.latitude !== undefined &&
          rider.longitude !== undefined
        );
      });
  }

  /**
   * Rank Riders By Distance
   */
  private rankNearbyRiders(
    shipment: Shipment,
    riders: ConnectedRider[],
  ) {
    return riders
      .map((rider) => ({
        rider,

        distance:
          this.calculateDistance(
            shipment.pickupLat,
            shipment.pickupLng,
            rider.latitude!,
            rider.longitude!,
          ),
      }))
      .sort(
        (a, b) =>
          a.distance - b.distance,
      );
  }

  /**
   * Notify Riders
   */
  private async notifyNearbyRiders(
    shipment: Shipment,
    rankedRiders: {
      rider: ConnectedRider;
      distance: number;
    }[],
  ): Promise<void> {
    /**
     * Only notify the closest riders.
     * (Can be changed later.)
     */
    const nearestRiders =
      rankedRiders.slice(0, 5);

    this.logger.log(
      `Sending job to ${nearestRiders.length} nearby riders.`,
    );

    for (const item of nearestRiders) {
      item.rider.socket.emit(
        'dispatch:new-job',
        {
          shipmentId: shipment.id,

          trackingCode:
            shipment.trackingCode,

          pickupAddress:
            shipment.pickupAddress,

          destinationAddress:
            shipment.destinationAddress,

          totalPrice: Number(
            shipment.totalPrice,
          ),

          distanceKm:
            shipment.distanceKm,

          estimatedMinutes:
            shipment.estimatedMinutes,

          riderDistance:
            Number(
              item.distance.toFixed(2),
            ),
        },
      );

      this.logger.log(
        `Job sent to rider ${item.rider.userId}`,
      );
    }
  }

  /**
   * Calculate Distance
   * (Haversine Formula)
   */
  private calculateDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): number {
    const R = 6371;

    const dLat =
      ((lat2 - lat1) * Math.PI) /
      180;

    const dLng =
      ((lng2 - lng1) * Math.PI) /
      180;

    const a =
      Math.sin(dLat / 2) *
        Math.sin(dLat / 2) +
      Math.cos(
        (lat1 * Math.PI) / 180,
      ) *
        Math.cos(
          (lat2 * Math.PI) / 180,
        ) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);

    const c =
      2 *
      Math.atan2(
        Math.sqrt(a),
        Math.sqrt(1 - a),
      );

    return R * c;
  }
}