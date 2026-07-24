import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { ShipmentStatus } from '@prisma/client';
import { PrismaService } from '../providers/database/prisma.service';
import { CompleteDeliveryDto } from './dto/complete-delivery.dto';
import { RealtimeService } from 'src/realtime/realtime.service';
import { DispatchService } from 'src/dispatch/dispatch.service';
import { NotificationService } from 'src/notification/notification.service';
import { NotificationType } from 'src/notification/dto/send-notification.dto';

@Injectable()
export class RiderJobsService {
  constructor(
    private readonly realtimeService: RealtimeService,
    private readonly prisma: PrismaService,
    private readonly dispatchService: DispatchService,
    private readonly notificationService: NotificationService, // 👈 Injected NotificationService
  ) {}

  /**
   * Get all available jobs
   */
  async getAvailableJobs() {
    const shipments = await this.prisma.shipment.findMany({
      where: {
        status: ShipmentStatus.PENDING,
        riderId: null,
      },
      orderBy: {
        createdAt: 'desc',
      },
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
    const rider = await this.prisma.riderProfile.findUnique({
      where: { userId: riderUserId },
    });

    if (!rider) throw new NotFoundException('Rider profile not found.');

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
    const reserved = this.dispatchService.reserveShipment(
      shipmentId,
      riderUserId,
    );

    if (!reserved) {
      throw new ConflictException(
        'Another rider is already accepting this shipment.',
      );
    }

    try {
      const rider = await this.prisma.riderProfile.findUnique({
        where: { userId: riderUserId },
      });

      if (!rider) throw new NotFoundException('Rider profile not found.');

      const shipment = await this.prisma.shipment.findUnique({
        where: { id: shipmentId },
      });

      if (!shipment) throw new NotFoundException('Shipment not found.');

      if (
        shipment.status !== ShipmentStatus.PENDING ||
        shipment.riderId
      ) {
        throw new ConflictException('This job has already been accepted.');
      }

      const updatedShipment = await this.prisma.shipment.update({
        where: { id: shipment.id },
        data: {
          riderId: rider.id,
          status: ShipmentStatus.ACCEPTED,
        },
      });

      await this.prisma.riderAssignment.create({
        data: {
          shipmentId: shipment.id,
          riderId: rider.id,
          status: 'ACCEPTED',
        },
      });

      await this.prisma.statusTimeline.create({
        data: {
          shipmentId: shipment.id,
          status: ShipmentStatus.ACCEPTED,
          changedBy: rider.userId,
          description: 'Shipment accepted by rider.',
        },
      });

      this.dispatchService.releaseReservation(shipment.id);
      this.realtimeService.broadcastJobTaken(shipment.id, rider.userId);

      // 🔔 Notify Customer that a rider has accepted
      this.notificationService
        .dispatch({
          type: NotificationType.RIDER_ASSIGNED,
          userId: shipment.customerId,
          title: 'Rider Assigned',
          body: `A dispatch rider has accepted your shipment (${shipment.trackingCode}).`,
          data: { shipmentId: shipment.id, trackingCode: shipment.trackingCode },
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
    const rider = await this.prisma.riderProfile.findUnique({
      where: { userId: riderUserId },
    });

    if (!rider) throw new NotFoundException('Rider not found.');

    const shipment = await this.prisma.shipment.findFirst({
      where: { id: shipmentId, riderId: rider.id },
    });

    if (!shipment) throw new NotFoundException('Shipment not found.');

    await this.prisma.shipment.update({
      where: { id: shipment.id },
      data: { status: ShipmentStatus.PICKED_UP },
    });

    await this.prisma.statusTimeline.create({
      data: {
        shipmentId: shipment.id,
        status: ShipmentStatus.PICKED_UP,
        changedBy: rider.userId,
        description: 'Rider arrived at pickup location.',
      },
    });

    // 🔔 Notify Customer
    this.notificationService
      .dispatch({
        type: NotificationType.ORDER_STATUS_UPDATE,
        userId: shipment.customerId,
        title: 'Rider at Pickup Location',
        body: `Your rider has arrived at the pickup location for shipment ${shipment.trackingCode}.`,
        data: { shipmentId: shipment.id },
      })
      .catch((err) => console.error('[NOTIFICATION_ERROR]', err));

    return { message: 'Arrival confirmed.' };
  }

  /**
   * Pickup Package
   */
  async pickupPackage(shipmentId: string, riderUserId: string) {
    const rider = await this.prisma.riderProfile.findUnique({
      where: { userId: riderUserId },
    });

    if (!rider) throw new NotFoundException('Rider not found.');

    const shipment = await this.prisma.shipment.findFirst({
      where: { id: shipmentId, riderId: rider.id },
    });

    if (!shipment) throw new NotFoundException('Shipment not found.');

    await this.prisma.shipment.update({
      where: { id: shipment.id },
      data: { status: ShipmentStatus.IN_TRANSIT },
    });

    await this.prisma.statusTimeline.create({
      data: {
        shipmentId: shipment.id,
        status: ShipmentStatus.IN_TRANSIT,
        changedBy: rider.userId,
        description: 'Package picked up.',
      },
    });

    // 🔔 Notify Customer
    this.notificationService
      .dispatch({
        type: NotificationType.ORDER_STATUS_UPDATE,
        userId: shipment.customerId,
        title: 'Package In Transit',
        body: `Your package (${shipment.trackingCode}) has been picked up and is now on the way!`,
        data: { shipmentId: shipment.id },
      })
      .catch((err) => console.error('[NOTIFICATION_ERROR]', err));

    return { message: 'Package is now in transit.' };
  }

  /**
   * Arrive Destination
   */
  async arriveDestination(shipmentId: string, riderUserId: string) {
    const rider = await this.prisma.riderProfile.findUnique({
      where: { userId: riderUserId },
    });

    if (!rider) throw new NotFoundException('Rider not found.');

    const shipment = await this.prisma.shipment.findFirst({
      where: { id: shipmentId, riderId: rider.id },
    });

    if (!shipment) throw new NotFoundException('Shipment not found.');

    await this.prisma.shipment.update({
      where: { id: shipment.id },
      data: { status: ShipmentStatus.OUT_FOR_DELIVERY },
    });

    await this.prisma.statusTimeline.create({
      data: {
        shipmentId: shipment.id,
        status: ShipmentStatus.OUT_FOR_DELIVERY,
        changedBy: rider.userId,
        description: 'Rider arrived at destination.',
      },
    });

    // 🔔 Notify Customer
    this.notificationService
      .dispatch({
        type: NotificationType.ORDER_STATUS_UPDATE,
        userId: shipment.customerId,
        title: 'Arrived at Destination',
        body: `Your rider has arrived at the destination for shipment ${shipment.trackingCode}. Please prepare your PIN.`,
        data: { shipmentId: shipment.id },
      })
      .catch((err) => console.error('[NOTIFICATION_ERROR]', err));

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
    const rider = await this.prisma.riderProfile.findUnique({
      where: { userId: riderUserId },
    });

    if (!rider) throw new NotFoundException('Rider profile not found.');

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
          referenceCode: `DELIVERY-${Date.now()}`,
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

    // 🔔 Dispatch Notification to Customer via NotificationService
    this.notificationService
      .dispatch({
        type: NotificationType.ORDER_STATUS_UPDATE,
        userId: shipment.customerId,
        title: 'Delivery Completed',
        body: `Your shipment (${shipment.trackingCode}) has been delivered successfully.`,
        data: { shipmentId: shipment.id },
      })
      .catch((err) => console.error('[NOTIFICATION_ERROR]', err));

    // 🔔 Dispatch Notification to Rider via NotificationService
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