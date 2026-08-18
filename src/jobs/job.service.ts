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
import { ShipmentStatus, VehicleType } from '@prisma/client';

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
      include: { activeVehicle: true },
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
   * Get all available jobs (Splits automatically between small parcel shipments and event transit jobs based on vehicle type)
   */
async getAvailableJobs(userId: string) {
    const rider = await this.getActiveRider(userId, true);
    const vehicleType = rider?.activeVehicle?.type;

    const isBusOrVan = 
      vehicleType === VehicleType.BUS || 
      vehicleType === VehicleType.VAN;

    if (isBusOrVan) {
      return this.fetchEventTransitJobs();
    }

    return this.fetchStandardDeliveryShipments();
  }

  /**
   * Fetch available bus/van event transit jobs from the EventTrip tables
   */
  private async fetchEventTransitJobs() {
    const availableTrips = await this.prisma.eventTrip.findMany({
      where: {
        driverId: null,
        isPublished: true,
        status: 'SCHEDULED',
      },
      include: {
        route: {
          include: {
            event: true,
            pickupPoints: true,
          },
        },
      },
      orderBy: { departureTime: 'asc' },
      take: 20,
    });

    const jobs = availableTrips.map((trip) => {
      const payout = Number(trip.route?.price ?? 0);
      const event = trip.route?.event;

      return {
        tripId: trip.id,
        tripLeg: trip.tripLeg,
        departureTime: trip.departureTime,
        arrivalTime: trip.arrivalTime,
        payout,
        route: {
          routeId: trip.route?.id,
          originCity: trip.route?.originCity,
          destination: trip.route?.destination,
          price: payout,
        },
        event: event ? {
          eventId: event.id,
          title: event.title,
          venue: event.venue,
          city: event.city,
          state: event.state,
          startDate: event.startDate,
          endDate: event.endDate,
          bannerUrl: event.bannerUrl,
        } : null,
        pickupPoints: trip.route?.pickupPoints ?? [],
      };
    });

    return {
      jobType: 'EVENT_TRANSIT',
      jobs,
    };
  }

  /**
   * Fetch all standard delivery jobs (Parcel, Food, Grocery, Pharmacy, Document) for bikes/cars
   */
  private async fetchStandardDeliveryShipments() {
    const shipments = await this.prisma.shipment.findMany({
      where: {
        status: 'PENDING',
        riderId: null,
        deliveryType: {
          in: ['PARCEL', 'FOOD', 'GROCERY', 'PHARMACY', 'DOCUMENT'],
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    const jobs = shipments.map((shipment) => {
      const totalPrice = Number(shipment.totalPrice ?? 0);
      const riderShare = Number(shipment.riderShare ?? totalPrice);

      return {
        ...shipment,
        totalPrice,
        riderShare,
        payout: riderShare,
      };
    });

    return {
      jobType: 'PARCEL_DELIVERY',
      jobs,
    };
  }
  /**
   * Get a single job (Handles both parcel shipments and event transit jobs)
   */
  async getJobDetails(jobId: string, riderUserId: string) {
    const rider = await this.getActiveRider(riderUserId);

    // 1. Try finding it as an EventTrip first
    const trip = await this.prisma.eventTrip.findUnique({
      where: { id: jobId },
      include: {
        route: {
          include: {
            event: { include: { organizer: true } },
            pickupPoints: true,
          },
        },
      },
    });

    if (trip) {
      if (trip.driverId !== null && trip.driverId !== rider.id) {
        throw new ConflictException('This transit job has already been claimed by another driver.');
      }

      const tripPrice = Number(trip.route.price);
      return {
        jobType: 'EVENT_TRANSIT',
        job: {
          tripId: trip.id,
          tripLeg: trip.tripLeg,
          departureTime: trip.departureTime,
          arrivalTime: trip.arrivalTime,
          status: trip.status,
          payout: tripPrice,
          route: {
            routeId: trip.route.id,
            originCity: trip.route.originCity,
            destination: trip.route.destination,
            price: tripPrice,
            pickupPoints: trip.route.pickupPoints,
          },
          event: trip.route.event,
        },
      };
    }

    // 2. Fallback to standard parcel shipment job details
    const shipment = await this.prisma.shipment.findUnique({
      where: { id: jobId },
    });

    if (!shipment) {
      throw new NotFoundException('Job not found.');
    }

    const canView =
      shipment.status === ShipmentStatus.PENDING ||
      shipment.riderId === rider.id;

    if (!canView) throw new NotFoundException('Job not found.');

    return {
      jobType: 'PARCEL_DELIVERY',
      job: {
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
        recipient: {
          name: shipment.recipient,
          phoneNumber: shipment.recipientPhone,
        },
        pickup: {
          address: shipment.pickupAddress,
          latitude: shipment.pickupLat,
          longitude: shipment.pickupLng,
        },
        destination: {
          address: shipment.destinationAddress,
          latitude: shipment.destinationLat,
          longitude: shipment.destinationLng,
        },
      },
    };
  }

  /**
   * Rider Accepts Job
   */
  async acceptJob(jobId: string, riderUserId: string) {
    const rider = await this.getActiveRider(riderUserId, true);

    if (rider.activeVehicle?.type === VehicleType.BUS || rider.activeVehicle?.type === VehicleType.VAN) {
      if (!rider.activeVehicleId) {
        throw new ForbiddenException('You must have an active vehicle assigned to your profile before accepting transit jobs.');
      }

      const updatedTrip = await this.prisma.$transaction(async (tx) => {
        const trip = await tx.eventTrip.findUnique({
          where: { id: jobId },
          include: { route: { include: { event: true } } },
        });

        if (!trip || trip.driverId !== null) {
          throw new ConflictException('This transit job is no longer available or has already been taken.');
        }

        return await tx.eventTrip.update({
          where: { id: jobId },
          data: {
            driverId: rider.id,
            vehicleId: rider.activeVehicleId,
          },
          include: {
            route: { include: { event: true } },
            vehicle: true,
            driver: { include: { user: true } },
          },
        });
      });

      return {
        message: 'Event transit job accepted successfully. Vehicle details linked automatically.',
        job: updatedTrip,
      };
    }

    // Standard parcel shipment acceptance workflow
    const reserved = this.dispatchService.reserveShipment(jobId, riderUserId);

    if (!reserved) {
      throw new ConflictException('Another rider is already accepting this shipment.');
    }

    try {
      const updatedShipment = await this.prisma.$transaction(async (tx) => {
        const shipment = await tx.shipment.findUnique({
          where: { id: jobId },
        });

        if (!shipment || shipment.status !== ShipmentStatus.PENDING || shipment.riderId) {
          throw new ConflictException('This job is no longer available.');
        }

        const updated = await tx.shipment.update({
          where: { id: jobId },
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

      this.dispatchService.releaseReservation(jobId);
      this.realtimeService.broadcastJobTaken(jobId, rider.userId);

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
      this.dispatchService.releaseReservation(jobId);
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

  /**
   * Dedicated endpoint for bus/van/car riders to browse scheduled event transit jobs
   */
async getEventTransitJobsForDriver(userId: string) {
    console.log('==================================================');
    console.log(`[EventJobsService] 🚀 Starting getEventTransitJobsForDriver for userId: ${userId}`);

    try {
      const rider = await this.getActiveRider(userId, true);
      const vehicleType = rider?.activeVehicle?.type;
      
      console.log(`[EventJobsService] Evaluated vehicleType: '${vehicleType ?? 'None found'}'`);

      const isEligible = 
        vehicleType === VehicleType.BUS || 
        vehicleType === VehicleType.VAN || 
        vehicleType === VehicleType.CAR;

      if (!isEligible) {
        console.warn(`[EventJobsService] ⛔ Access Denied. Vehicle type '${vehicleType}' is not authorized for event transit.`);
        return {
          success: false,
          message: 'Event transit jobs are only available for Bus, Van, or Car vehicle profiles.',
          jobs: [],
        };
      }

      const totalTripsInDb = await this.prisma.eventTrip.count();
      console.log(`[EventJobsService] 📊 Total EventTrips records in database: ${totalTripsInDb}`);

      // Diagnostic sample to inspect why filters might return empty sets
      const rawSample = await this.prisma.eventTrip.findFirst();
      console.log('[EventJobsService DEBUG] Sample EventTrip record fields:', {
        driverId: rawSample?.driverId,
        isPublished: rawSample?.isPublished,
        status: rawSample?.status,
      });

      // Flexible query handling nullable/unassigned drivers and enum matching
      const availableTrips = await this.prisma.eventTrip.findMany({
        where: {
          OR: [
            { driverId: null },
            { driverId: '' },
          ],
          
          status: 'SCHEDULED' as any,
        },
        include: {
          route: {
            include: {
              event: true,
              pickupPoints: true,
            },
          },
        },
        orderBy: { departureTime: 'asc' },
        take: 20,
      });

      console.log(`[EventJobsService] 🔍 Query complete. Found matching trips count: ${availableTrips.length}`);

 const jobs = availableTrips.map((trip) => {
        // Use trip.driverPayout if present, otherwise fallback to route price
        const driverPayoutAmount = trip.driverPayout !== null && trip.driverPayout !== undefined 
          ? Number(trip.driverPayout) 
          : Number(trip.route?.price ?? 0);

        const event = trip.route?.event;

        return {
          tripId: trip.id,
          tripLeg: trip.tripLeg,
          departureTime: trip.departureTime,
          arrivalTime: trip.arrivalTime,
          // Provide structured payout object to match your frontend expectations
          payout: {
            driverPayout: driverPayoutAmount,
            customerOneWayFare: Number(trip.customerOneWayFare ?? trip.route?.price ?? 0),
            customerRoundTripFare: Number(trip.customerRoundTripFare ?? 0),
          },
          driverPayout: driverPayoutAmount, // Root level fallback if needed
          route: {
            routeId: trip.route?.id,
            originCity: trip.route?.originCity,
            destination: trip.route?.destination,
            price: Number(trip.route?.price ?? 0),
          },
          event: event ? {
            eventId: event.id,
            title: event.title,
            venue: event.venue,
            city: event.city,
            state: event.state,
            startDate: event.startDate,
            endDate: event.endDate,
            bannerUrl: event.bannerUrl,
          } : null,
          pickupPoints: trip.route?.pickupPoints ?? [],
        };
      });

      console.log(`[EventJobsService] ✨ Successfully mapped ${jobs.length} event jobs.`);
      console.log('==================================================');

      return {
        jobType: 'EVENT_TRANSIT',
        jobs,
      };

    } catch (dbError) {
      console.error('[EventJobsService] ❌ Database query failed inside getEventTransitJobsForDriver:', dbError);
      throw dbError;
    }
  }
}