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

@Injectable()
export class RiderJobsService {
  constructor(
    private readonly realtimeService: RealtimeService,
    private readonly prisma: PrismaService,
    private readonly dispatchService: DispatchService,
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
  async getJobDetails(
    shipmentId: string,
    riderUserId: string,
  ) {
    /**
     * Find rider profile
     */
    const rider =
      await this.prisma.riderProfile.findUnique({
        where: {
          userId: riderUserId,
        },
      });

    if (!rider) {
      throw new NotFoundException(
        'Rider profile not found.',
      );
    }

    /**
     * Find shipment
     */
    const shipment =
      await this.prisma.shipment.findUnique({
        where: {
          id: shipmentId,
        },
      });

    if (!shipment) {
      throw new NotFoundException(
        'Shipment not found.',
      );
    }

    /**
     * Allow:
     * 1. Available jobs
     * 2. Rider's own accepted jobs
     */
    const canView =
      shipment.status === ShipmentStatus.PENDING ||
      shipment.riderId === rider.id;

    if (!canView) {
      throw new NotFoundException(
        'Shipment not found.',
      );
    }

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

async acceptJob(
  shipmentId: string,
  riderUserId: string,
) {
  /**
   * Try to reserve shipment
   */
  const reserved =
    this.dispatchService.reserveShipment(
      shipmentId,
      riderUserId,
    );

  if (!reserved) {
    throw new ConflictException(
      'Another rider is already accepting this shipment.',
    );
  }

  try {
    /**
     * Find Rider
     */
    const rider =
      await this.prisma.riderProfile.findUnique({
        where: {
          userId: riderUserId,
        },
      });

    if (!rider) {
      throw new NotFoundException(
        'Rider profile not found.',
      );
    }

    /**
     * Find Shipment
     */
    const shipment =
      await this.prisma.shipment.findUnique({
        where: {
          id: shipmentId,
        },
      });

    if (!shipment) {
      throw new NotFoundException(
        'Shipment not found.',
      );
    }

    /**
     * Already accepted?
     */
    if (
      shipment.status !== ShipmentStatus.PENDING ||
      shipment.riderId
    ) {
      throw new ConflictException(
        'This job has already been accepted.',
      );
    }

    /**
     * Accept Job
     */
    const updatedShipment =
      await this.prisma.shipment.update({
        where: {
          id: shipment.id,
        },
        data: {
          riderId: rider.id,
          status: ShipmentStatus.ACCEPTED,
        },
      });

    /**
     * Assignment History
     */
    await this.prisma.riderAssignment.create({
      data: {
        shipmentId: shipment.id,
        riderId: rider.id,
        status: 'ACCEPTED',
      },
    });

    /**
     * Timeline
     */
    await this.prisma.statusTimeline.create({
      data: {
        shipmentId: shipment.id,
        status: ShipmentStatus.ACCEPTED,
        changedBy: rider.userId,
        description:
          'Shipment accepted by rider.',
      },
    });

    /**
     * Remove reservation
     */
    this.dispatchService.releaseReservation(
      shipment.id,
    );

    /**
     * Tell everyone else the job is gone
     */
    this.realtimeService.broadcastJobTaken(
      shipment.id,
      rider.userId,
    );

    return {
      message: 'Job accepted successfully.',
      shipment: updatedShipment,
    };
  } catch (error) {
    /**
     * Release reservation on failure
     */
    this.dispatchService.releaseReservation(
      shipmentId,
    );

    throw error;
  }
}
async arrivePickup(
  shipmentId: string,
  riderUserId: string,
) {
  const rider =
    await this.prisma.riderProfile.findUnique({
      where: {
        userId: riderUserId,
      },
    });

  if (!rider)
    throw new NotFoundException(
      'Rider not found.',
    );

  const shipment =
    await this.prisma.shipment.findFirst({
      where: {
        id: shipmentId,
        riderId: rider.id,
      },
    });

  if (!shipment)
    throw new NotFoundException(
      'Shipment not found.',
    );

  await this.prisma.shipment.update({
    where: {
      id: shipment.id,
    },
    data: {
      status: ShipmentStatus.PICKED_UP,
    },
  });

  await this.prisma.statusTimeline.create({
    data: {
      shipmentId: shipment.id,
      status: ShipmentStatus.PICKED_UP,
      changedBy: rider.userId,
      description:
        'Rider arrived at pickup location.',
    },
  });

  return {
    message:
      'Arrival confirmed.',
  };
}

async pickupPackage(
  shipmentId: string,
  riderUserId: string,
) {
  const rider =
    await this.prisma.riderProfile.findUnique({
      where: {
        userId: riderUserId,
      },
    });

  if (!rider)
    throw new NotFoundException(
      'Rider not found.',
    );

  const shipment =
    await this.prisma.shipment.findFirst({
      where: {
        id: shipmentId,
        riderId: rider.id,
      },
    });

  if (!shipment)
    throw new NotFoundException(
      'Shipment not found.',
    );

  await this.prisma.shipment.update({
    where: {
      id: shipment.id,
    },
    data: {
      status: ShipmentStatus.IN_TRANSIT,
    },
  });

  await this.prisma.statusTimeline.create({
    data: {
      shipmentId: shipment.id,
      status: ShipmentStatus.IN_TRANSIT,
      changedBy: rider.userId,
      description:
        'Package picked up.',
    },
  });

  return {
    message:
      'Package is now in transit.',
  };
}

async arriveDestination(
  shipmentId: string,
  riderUserId: string,
) {
  const rider =
    await this.prisma.riderProfile.findUnique({
      where: {
        userId: riderUserId,
      },
    });

  if (!rider)
    throw new NotFoundException(
      'Rider not found.',
    );

  const shipment =
    await this.prisma.shipment.findFirst({
      where: {
        id: shipmentId,
        riderId: rider.id,
      },
    });

  if (!shipment)
    throw new NotFoundException(
      'Shipment not found.',
    );

  await this.prisma.shipment.update({
    where: {
      id: shipment.id,
    },
    data: {
      status: ShipmentStatus.OUT_FOR_DELIVERY,
    },
  });

  await this.prisma.statusTimeline.create({
    data: {
      shipmentId: shipment.id,
      status:
        ShipmentStatus.OUT_FOR_DELIVERY,
      changedBy: rider.userId,
      description:
        'Rider arrived at destination.',
    },
  });

  return {
    message:
      'Arrived at destination.',
  };
}

async completeDelivery(
  shipmentId: string,
  riderUserId: string,
  dto: CompleteDeliveryDto,
) {
  /**
   * Find Rider
   */
  const rider = await this.prisma.riderProfile.findUnique({
    where: {
      userId: riderUserId,
    },
  });

  if (!rider) {
    throw new NotFoundException(
      'Rider profile not found.',
    );
  }

  /**
   * Find Shipment
   */
  const shipment = await this.prisma.shipment.findFirst({
    where: {
      id: shipmentId,
      riderId: rider.id,
    },
  });

  if (!shipment) {
    throw new NotFoundException(
      'Shipment not found.',
    );
  }

  /**
   * Validate PIN
   */
  if (shipment.verificationPin !== dto.verificationPin) {
    throw new BadRequestException(
      'Invalid verification PIN.',
    );
  }

  /**
   * Prevent duplicate completion
   */
  if (shipment.status === ShipmentStatus.DELIVERED) {
    throw new ConflictException(
      'Shipment already delivered.',
    );
  }

  /**
   * Complete Delivery Transaction
   */
  await this.prisma.$transaction(async (tx) => {
    /**
     * Mark Shipment Delivered
     */
    await tx.shipment.update({
      where: {
        id: shipment.id,
      },
      data: {
        status: ShipmentStatus.DELIVERED,
      },
    });

    /**
     * Update Rider Stats
     */
    await tx.riderProfile.update({
      where: {
        id: rider.id,
      },
      data: {
        completedDeliveries: {
          increment: 1,
        },
      },
    });

    /**
     * Find Wallet
     */
    let wallet = await tx.wallet.findUnique({
      where: {
        userId: rider.userId,
      },
    });

    /**
     * Create Wallet if Missing
     */
    if (!wallet) {
      wallet = await tx.wallet.create({
        data: {
          userId: rider.userId,
          availableBalance: 0,
          pendingBalance: 0,
        },
      });
    }

    /**
     * Credit Wallet
     */
    await tx.wallet.update({
      where: {
        id: wallet.id,
      },
      data: {
        availableBalance: {
          increment: shipment.riderShare,
        },
      },
    });

    /**
     * Wallet Ledger
     */
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

    /**
     * Shipment Timeline
     */
    await tx.statusTimeline.create({
      data: {
        shipmentId: shipment.id,
        status: ShipmentStatus.DELIVERED,
        changedBy: rider.userId,
        description:
          'Shipment delivered successfully.',
      },
    });

    /**
     * Notify Customer
     */
    await tx.notification.create({
      data: {
        userId: shipment.customerId,
        title: 'Delivery Completed',
        body:
          'Your shipment has been delivered successfully.',
      },
    });
  });

  return {
    success: true,
    message: 'Delivery completed successfully.',
  };
}
}