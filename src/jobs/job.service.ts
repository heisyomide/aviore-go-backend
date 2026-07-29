import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../providers/database/prisma.service';
import { CompleteDeliveryDto } from './dto/complete-delivery.dto';
import { RealtimeService } from 'src/realtime/realtime.service';
import { DispatchService } from 'src/dispatch/dispatch.service';
import { NotificationService } from 'src/notification/notification.service';
import { NotificationType } from 'src/notification/dto/send-notification.dto';
import { ShipmentStatus } from '@prisma/client';

@Injectable()
export class RiderJobsService {
  constructor(
    private readonly realtimeService: RealtimeService,
    private readonly prisma: PrismaService,
    private readonly dispatchService: DispatchService,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Helper: Get and validate active rider profile
   */
  private async getActiveRider(userId: string, requireOnline = false) {
    const rider = await this.prisma.riderProfile.findUnique({
      where: { userId },
    });

    if (!rider) {
      throw new NotFoundException('Rider profile not found.');
    }

    if (requireOnline && !rider.isOnline) {
      throw new ForbiddenException(
        'You are currently offline. Please toggle your status to online.',
      );
    }

    return rider;
  }

  /**
   * Get all available jobs
   */
  async getAvailableJobs(userId: string) {
    await this.getActiveRider(userId, true);

    const shipments = await this.prisma.shipment.findMany({
      where: {
        status: ShipmentStatus.PENDING,
        riderId: null,
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return shipments.map((shipment) => ({
      id: shipment.id,
      trackingCode: shipment.trackingCode,
      packageCategory: shipment.packageCategory,
      deliveryType: shipment.deliveryType,
      weightRange: shipment.weightRange,
      pickupAddress: shipment.pickupAddress,
      destinationAddress: shipment.destinationAddress,
      distanceKm: shipment.distanceKm,
      estimatedMinutes: shipment.estimatedMinutes,
      payout: Number(shipment.riderShare),
      isExpress: shipment.isExpress,
      createdAt: shipment.createdAt,
    }));
  }

  /**
   * Get a single job
   */
  async getJobDetails(shipmentId: string, riderUserId: string) {
    const rider = await this.getActiveRider(riderUserId);

    const shipment = await this.prisma.shipment.findUnique({
      where: { id: shipmentId },
    });

    if (!shipment) throw new NotFoundException('Shipment not found.');

    const canView =
      shipment.status === ShipmentStatus.PENDING ||
      shipment.riderId === rider.id;

    if (!canView) throw new NotFoundException('Shipment not found.');

    return {
      shipment: {
        id: shipment.id,
        trackingCode: shipment.trackingCode,
        status: shipment.status,
        packageCategory: shipment.packageCategory,
        deliveryType: shipment.deliveryType,
        weightRange: shipment.weightRange,
        description: shipment.description ?? '',
        distanceKm: shipment.distanceKm,
        estimatedMinutes: shipment.estimatedMinutes,
        totalPrice: Number(shipment.totalPrice),
        riderShare: Number(shipment.riderShare),
        verificationPin: shipment.verificationPin,
        isExpress: shipment.isExpress,
        isFragile: shipment.isFragile,
        waterproof: shipment.waterproof,
        keepUpright: shipment.keepUpright,
        handleWithCare: shipment.handleWithCare,
        recipient: {
          name: shipment.recipient,
          phoneNumber: shipment.recipientPhone,
        },
        pickup: {
          address: shipment.pickupAddress,
          latitude: shipment.pickupLat,
          longitude: shipment.pickupLng,
          placeId: shipment.pickupPlaceId,
        },
        destination: {
          address: shipment.destinationAddress,
          latitude: shipment.destinationLat,
          longitude: shipment.destinationLng,
          placeId: shipment.destinationPlaceId,
        },
      },
    };
  }

  /**
   * Rider Accepts Job
   */
  async acceptJob(shipmentId: string, riderUserId: string) {
    const reserved = this.dispatchService.reserveShipment(shipmentId, riderUserId);

    if (!reserved) {
      throw new ConflictException('Another rider is already accepting this shipment.');
    }

    try {
      const rider = await this.getActiveRider(riderUserId, true);

      const updatedShipment = await this.prisma.$transaction(async (tx) => {
        const shipment = await tx.shipment.findUnique({
          where: { id: shipmentId },
        });

        if (!shipment || shipment.status !== ShipmentStatus.PENDING || shipment.riderId) {
          throw new ConflictException('This job is no longer available.');
        }

        const updated = await tx.shipment.update({
          where: { id: shipmentId },
          data: {
            riderId: rider.id,
            status: ShipmentStatus.ACCEPTED,
          },
        });

        await tx.riderAssignment.create({
          data: {
            shipmentId: shipment.id,
            riderId: rider.id,
            status: 'ACCEPTED',
          },
        });

        await tx.statusTimeline.create({
          data: {
            shipmentId: shipment.id,
            status: ShipmentStatus.ACCEPTED,
            changedBy: rider.userId,
            description: 'Shipment accepted by rider.',
          },
        });

        return updated;
      });

      this.dispatchService.releaseReservation(shipmentId);
      this.realtimeService.broadcastJobTaken(shipmentId, rider.userId);

      this.notificationService
        .dispatch({
          type: NotificationType.RIDER_ASSIGNED,
          userId: updatedShipment.customerId,
          title: 'Rider Assigned',
          body: `A dispatch rider has accepted your shipment (${updatedShipment.trackingCode}).`,
          data: { shipmentId: updatedShipment.id, trackingCode: updatedShipment.trackingCode },
        })
        .catch((err) => console.error('[NOTIFICATION_ERROR]', err));

      return {
        message: 'Job accepted successfully.',
        shipment: updatedShipment,
      };
    } catch (error) {
      this.dispatchService.releaseReservation(shipmentId);
      throw error;
    }
  }

  /**
   * Arrive Pickup
   */
  async arrivePickup(shipmentId: string, riderUserId: string) {
    const rider = await this.getActiveRider(riderUserId);

    await this.prisma.$transaction(async (tx) => {
      const shipment = await tx.shipment.findFirst({
        where: { id: shipmentId, riderId: rider.id },
      });

      if (!shipment) throw new NotFoundException('Shipment not found.');
      if (shipment.status !== ShipmentStatus.ACCEPTED) {
        throw new BadRequestException('Shipment must be ACCEPTED before arriving at pickup.');
      }

      await tx.shipment.update({
        where: { id: shipment.id },
        data: { status: ShipmentStatus.PICKED_UP },
      });

      await tx.statusTimeline.create({
        data: {
          shipmentId: shipment.id,
          status: ShipmentStatus.PICKED_UP,
          changedBy: rider.userId,
          description: 'Rider arrived at pickup location.',
        },
      });

      this.notificationService
        .dispatch({
          type: NotificationType.ORDER_STATUS_UPDATE,
          userId: shipment.customerId,
          title: 'Rider at Pickup Location',
          body: `Your rider has arrived at the pickup location for shipment ${shipment.trackingCode}.`,
          data: { shipmentId: shipment.id },
        })
        .catch((err) => console.error('[NOTIFICATION_ERROR]', err));
    });

    return { message: 'Arrival confirmed.' };
  }

  /**
   * Pickup Package
   */
  async pickupPackage(shipmentId: string, riderUserId: string) {
    const rider = await this.getActiveRider(riderUserId);

    await this.prisma.$transaction(async (tx) => {
      const shipment = await tx.shipment.findFirst({
        where: { id: shipmentId, riderId: rider.id },
      });

      if (!shipment) throw new NotFoundException('Shipment not found.');
      if (shipment.status !== ShipmentStatus.PICKED_UP) {
        throw new BadRequestException('Rider must arrive at pickup before starting transit.');
      }

      await tx.shipment.update({
        where: { id: shipment.id },
        data: { status: ShipmentStatus.IN_TRANSIT },
      });

      await tx.statusTimeline.create({
        data: {
          shipmentId: shipment.id,
          status: ShipmentStatus.IN_TRANSIT,
          changedBy: rider.userId,
          description: 'Package picked up.',
        },
      });

      this.notificationService
        .dispatch({
          type: NotificationType.ORDER_STATUS_UPDATE,
          userId: shipment.customerId,
          title: 'Package In Transit',
          body: `Your package (${shipment.trackingCode}) has been picked up and is now on the way!`,
          data: { shipmentId: shipment.id },
        })
        .catch((err) => console.error('[NOTIFICATION_ERROR]', err));
    });

    return { message: 'Package is now in transit.' };
  }

  /**
   * Arrive Destination
   */
  async arriveDestination(shipmentId: string, riderUserId: string) {
    const rider = await this.getActiveRider(riderUserId);

    await this.prisma.$transaction(async (tx) => {
      const shipment = await tx.shipment.findFirst({
        where: { id: shipmentId, riderId: rider.id },
      });

      if (!shipment) throw new NotFoundException('Shipment not found.');
      if (shipment.status !== ShipmentStatus.IN_TRANSIT) {
        throw new BadRequestException('Shipment must be IN_TRANSIT before reaching destination.');
      }

      await tx.shipment.update({
        where: { id: shipment.id },
        data: { status: ShipmentStatus.OUT_FOR_DELIVERY },
      });

      await tx.statusTimeline.create({
        data: {
          shipmentId: shipment.id,
          status: ShipmentStatus.OUT_FOR_DELIVERY,
          changedBy: rider.userId,
          description: 'Rider arrived at destination.',
        },
      });

      this.notificationService
        .dispatch({
          type: NotificationType.ORDER_STATUS_UPDATE,
          userId: shipment.customerId,
          title: 'Arrived at Destination',
          body: `Your rider has arrived at the destination for shipment ${shipment.trackingCode}. Please prepare your PIN.`,
          data: { shipmentId: shipment.id },
        })
        .catch((err) => console.error('[NOTIFICATION_ERROR]', err));
    });

    return { message: 'Arrived at destination.' };
  }

  /**
   * Complete Delivery
   */
  async completeDelivery(
    shipmentId: string,
    riderUserId: string,
    dto: CompleteDeliveryDto,
  ) {
    const rider = await this.getActiveRider(riderUserId);

    const shipment = await this.prisma.shipment.findFirst({
      where: { id: shipmentId, riderId: rider.id },
    });

    if (!shipment) throw new NotFoundException('Shipment not found.');

    if (shipment.verificationPin !== dto.verificationPin) {
      throw new BadRequestException('Invalid verification PIN.');
    }

    if (shipment.status === ShipmentStatus.DELIVERED) {
      throw new ConflictException('Shipment already delivered.');
    }

    if (shipment.status !== ShipmentStatus.OUT_FOR_DELIVERY) {
      throw new BadRequestException('Shipment must be OUT_FOR_DELIVERY before completing.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.shipment.update({
        where: { id: shipment.id },
        data: { status: ShipmentStatus.DELIVERED },
      });

      await tx.riderProfile.update({
        where: { id: rider.id },
        data: { completedDeliveries: { increment: 1 } },
      });

      let wallet = await tx.wallet.findUnique({
        where: { userId: rider.userId },
      });

      if (!wallet) {
        wallet = await tx.wallet.create({
          data: {
            userId: rider.userId,
            availableBalance: 0,
            pendingBalance: 0,
          },
        });
      }

      await tx.wallet.update({
        where: { id: wallet.id },
        data: { availableBalance: { increment: shipment.riderShare } },
      });

      await tx.transaction.create({
        data: {
          walletId: wallet.id,
          amount: shipment.riderShare,
          type: 'CREDIT',
          category: 'RIDER_EARNINGS',
          description: `Delivery earnings (${shipment.trackingCode})`,
          referenceCode: `DELIVERY-${shipment.trackingCode}-${Date.now()}`,
        },
      });

      await tx.statusTimeline.create({
        data: {
          shipmentId: shipment.id,
          status: ShipmentStatus.DELIVERED,
          changedBy: rider.userId,
          description: 'Shipment delivered successfully.',
        },
      });
    });

    // Send notifications after transaction succeeds
    this.notificationService
      .dispatch({
        type: NotificationType.ORDER_STATUS_UPDATE,
        userId: shipment.customerId,
        title: 'Delivery Completed',
        body: `Your shipment (${shipment.trackingCode}) has been delivered successfully.`,
        data: { shipmentId: shipment.id },
      })
      .catch((err) => console.error('[NOTIFICATION_ERROR]', err));

    this.notificationService
      .dispatch({
        type: NotificationType.PAYMENT_RECEIPT,
        userId: rider.userId,
        title: 'Payout Received',
        body: `You received ₦${shipment.riderShare} for delivering shipment ${shipment.trackingCode}.`,
        data: { shipmentId: shipment.id },
      })
      .catch((err) => console.error('[NOTIFICATION_ERROR]', err));

    return {
      success: true,
      message: 'Delivery completed successfully.',
    };
  }
}