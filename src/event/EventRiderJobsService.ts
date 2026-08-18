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
      tripId: trip.id, // Fixed: match frontend EventJob interface property name
      tripLeg: trip.tripLeg,
      departureTime: trip.departureTime,
      arrivalTime: (trip as any).arrivalTime || trip.departureTime,
      event: {
        eventId: (trip.route.event as any).id || '',
        title: trip.route.event.title,
        venue: trip.route.event.venue,
        city: (trip.route.event as any).city || '',
        state: (trip.route.event as any).state || '',
        startDate: trip.route.event.startDate ? new Date(trip.route.event.startDate).toISOString() : '',
        endDate: (trip.route.event as any).endDate ? new Date((trip.route.event as any).endDate).toISOString() : '',
        bannerUrl: trip.route.event.bannerUrl,
      },
      route: {
        routeId: trip.route.id,
        originCity: trip.route.originCity,
        destination: trip.route.destination,
        price: Number(trip.route.price),
      },
      driverPayout: trip.driverPayout !== null && trip.driverPayout !== undefined ? Number(trip.driverPayout) : 0,
      payout: {
        driverPayout: trip.driverPayout !== null && trip.driverPayout !== undefined ? Number(trip.driverPayout) : Number((trip.route as any).driverPayout || 0),
        customerOneWayFare: trip.customerOneWayFare !== null && trip.customerOneWayFare !== undefined ? Number(trip.customerOneWayFare) : Number(trip.route.price || 0),
        customerRoundTripFare: trip.customerRoundTripFare !== null && trip.customerRoundTripFare !== undefined ? Number(trip.customerRoundTripFare) : Number((trip.route as any).customerRoundTripFare || 0),
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
    const trips = await this.prisma.eventTrip.findMany({
      where: {
        driver: {
          userId: riderId, // Adjust to 'id: riderId' if riderId points directly to the Driver profile
        },
        status: {
          in: ['BOARDING', 'IN_TRANSIT'],
        },
      },
      include: {
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

    // Map the payout property safely to match what your frontend expects
    return trips.map((trip) => {
      const tripAny = trip as any;
      return {
        ...trip,
        payout: tripAny.driverPayout ?? tripAny.payout ?? 0,
      };
    });
  }
}