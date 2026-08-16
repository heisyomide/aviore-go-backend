import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../providers/database/prisma.service';
import { CreateTripDto } from './dto/create-trip.dto';

@Injectable()
export class AdminEventsService {
  constructor(private prisma: PrismaService) {}

  // 1. Get all pending events for admin review
  async getPendingEvents() {
    return this.prisma.event.findMany({
      where: { status: 'PENDING_REVIEW' },
      include: {
        organizer: { include: { user: true } },
        routes: {
          include: {
            pickupPoints: true,
            trips: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // 2. Admin reviews and ACCEPTS the event (Moves from PENDING_REVIEW to DRAFT / or approved state, ready for driver assignment)
  async acceptEvent(eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: { organizer: { include: { user: true } } },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    if (event.status !== 'PENDING_REVIEW') {
      throw new BadRequestException('Event is not pending review');
    }

    const updatedEvent = await this.prisma.event.update({
      where: { id: eventId },
      data: { status: 'DRAFT' }, // Accepted by admin, now ready for rider trip scheduling slots
    });

    // Send notification to the event organizer
    if (event.organizer?.user?.id) {
      await this.prisma.notification.create({
        data: {
          userId: event.organizer.user.id,
          title: 'Event Approved! 🎉',
          body: `Your event "${event.title}" has been reviewed and accepted. Fleet scheduling is now in progress.`,
          type: 'EVENT_ACCEPTED',
        },
      }).catch(() => {});
    }

    return updatedEvent;
  }

async getAcceptedUnscheduledEvents() {
  return this.prisma.event.findMany({
    where: {
      status: 'DRAFT',
      routes: {
        some: {
          trips: {
            none: {}, // Ensures it has routes, but none of them have trips scheduled yet
          },
        },
      },
    },
    include: {
      organizer: { 
        include: { 
          user: { 
            select: { firstName: true, lastName: true, email: true, phoneNumber: true } 
          } 
        } 
      },
      routes: {
        include: {
          pickupPoints: true,
          trips: true,
        },
      },
    },
    orderBy: { startDate: 'asc' },
  });
}
  
  // 3. Admin schedules a trip (Creates job slots for drivers to see in Available Jobs with isPublished: false)
  async scheduleTrip(dto: CreateTripDto) {
    const route = await this.prisma.eventRoute.findUnique({
      where: { id: dto.routeId },
      include: { event: true },
    });

    if (!route) {
      throw new NotFoundException('Event route not found');
    }

    // Create the trip schedule slot for drivers (isPublished defaults to false)
    const trip = await this.prisma.eventTrip.create({
      data: {
        routeId: dto.routeId,
        vehicleId: dto.vehicleId || null,
        driverId: dto.driverId || null, // Can be assigned later when driver accepts from available jobs
        tripLeg: dto.tripLeg || 'OUTBOUND',
        departureTime: new Date(dto.departureTime),
        arrivalTime: dto.arrivalTime ? new Date(dto.arrivalTime) : null,
        status: 'SCHEDULED',
        isPublished: false, // Hidden from customers/organizers until manually pushed live later
      },
      include: {
        route: { include: { event: true } },
        vehicle: true,
        driver: { include: { user: true } },
      },
    });

    return trip;
  }

  // 4. Admin publishes the trip live for attendees and organizers to see and book seats
  async publishTripLive(tripId: string) {
    const trip = await this.prisma.eventTrip.findUnique({
      where: { id: tripId },
      include: {
        route: {
          include: {
            event: true,
            waitlist: true,
          },
        },
        driver: true,
      },
    });

    if (!trip) {
      throw new NotFoundException('Trip schedule not found');
    }

    // Ensure a driver and vehicle are locked in before publishing live to the public
    if (!trip.driverId || !trip.vehicleId) {
      throw new BadRequestException('Cannot publish trip live: A driver and vehicle must be assigned first.');
    }

    // Update trip to published status
    const publishedTrip = await this.prisma.eventTrip.update({
      where: { id: tripId },
      data: { isPublished: true },
      include: {
        route: { include: { event: true } },
        vehicle: true,
        driver: { include: { user: true } },
      },
    });

    // Also update the parent event status to PUBLISHED if not already
    await this.prisma.event.update({
      where: { id: trip.route.eventId },
      data: { status: 'PUBLISHED' },
    });

    // Notify all waitlisted users instantly that seats are now live
    const waitlistedUserIds = trip.route.waitlist.map((w) => w.userId);

    if (waitlistedUserIds.length > 0) {
      await this.prisma.notification.createMany({
        data: waitlistedUserIds.map((userId) => ({
          userId: userId,
          title: `Transit Live: ${trip.route.event.title} 🚌`,
          body: `Buses from ${trip.route.originCity} to ${trip.route.destination} are now live. Secure your seat!`,
          type: 'TRIP_SCHEDULED',
        })),
      }).catch(() => {});
    }

    return publishedTrip;
  }

  // Add this inside AdminEventsService
  async getAllEvents() {
    return this.prisma.event.findMany({
      include: {
        organizer: { include: { user: true } },
        routes: {
          include: {
            pickupPoints: true,
            trips: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}