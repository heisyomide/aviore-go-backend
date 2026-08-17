import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../providers/database/prisma.service';
import { TripStatus, VehicleType } from '@prisma/client';

@Injectable()
export class EventRiderJobsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Helper: Get and validate active event driver profile & vehicle
   */
  private async getActiveEventDriver(userId: string) {
    const rider = await this.prisma.riderProfile.findUnique({
      where: { userId },
      include: { activeVehicle: true },
    });

    if (!rider) {
      throw new NotFoundException('Rider profile not found.');
    }

    if (!rider.isOnline) {
      throw new ForbiddenException('You are currently offline. Please go online to view event trips.');
    }

    // Ensure the rider is using an appropriate vehicle for mass transport
    const allowedTypes: VehicleType[] = [VehicleType.BUS, VehicleType.VAN, VehicleType.CAR];
    if (!rider.activeVehicle || !allowedTypes.includes(rider.activeVehicle.type)) {
      throw new ForbiddenException('Only drivers with a Bus, Van, or Car can accept event transit trips.');
    }

    return rider;
  }

  /**
   * Get available event transit jobs for bus/van drivers
   */
  async getAvailableEventTrips(userId: string) {
    await this.getActiveEventDriver(userId);

    const trips = await this.prisma.eventTrip.findMany({
      where: {
        status: TripStatus.SCHEDULED,
        driverId: null, // Unassigned trips
      },
      include: {
        route: {
          include: {
            event: {
              select: { title: true, venue: true, startDate: true, bannerUrl: true },
            },
            pickupPoints: true,
          },
        },
        vehicle: true,
      },
      orderBy: { departureTime: 'asc' },
      take: 20,
    });

    return trips.map((trip) => ({
      id: trip.id,
      tripLeg: trip.tripLeg,
      departureTime: trip.departureTime,
      event: {
        title: trip.route.event.title,
        venue: trip.route.event.venue,
        date: trip.route.event.startDate,
        bannerUrl: trip.route.event.bannerUrl,
      },
      route: {
        origin: trip.route.originCity,
        destination: trip.route.destination,
        price: Number(trip.route.price),
      },
      pickupPoints: trip.route.pickupPoints,
    }));
  }

  /**
   * Event Driver Accepts a Trip
   */
  async acceptEventTrip(tripId: string, userId: string) {
    const rider = await this.getActiveEventDriver(userId);

    return await this.prisma.$transaction(async (tx) => {
      const trip = await tx.eventTrip.findUnique({
        where: { id: tripId },
      });

      if (!trip || trip.status !== TripStatus.SCHEDULED || trip.driverId) {
        throw new ConflictException('This event trip is no longer available.');
      }

      const updatedTrip = await tx.eventTrip.update({
        where: { id: tripId },
        data: {
          driverId: rider.id,
          vehicleId: rider.activeVehicleId,
          status: TripStatus.BOARDING,
        },
      });

      return {
        success: true,
        message: 'Event trip accepted successfully. You are now assigned for boarding.',
        trip: updatedTrip,
      };
    });
  }

  // jobs.service.ts (Backend)
async getAcceptedEventTrips(riderId: string) {
  return this.prisma.eventTrip.findMany({
   where: {
      driver: {
        userId: riderId, // Or 'id: riderId' depending on whether riderId is the User ID or Driver Profile ID
      },
      status: {
        in: ['BOARDING', 'IN_TRANSIT'],
      },
    },
    include: {
      // Include route and nest event inside it to avoid duplicate keys
      route: {
        include: {
          event: true,
        },
      },
      _count: {
        select: { bookings: true },
      },
    },
    orderBy: {
      departureTime: 'asc',
    },
  });
}
}