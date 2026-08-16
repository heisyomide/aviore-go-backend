import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../providers/database/prisma.service';
import { CreateEventDto } from './dto/create-event.dto';
  import { CreateTripDto } from '../admin/dto/create-trip.dto'; 
   import { CreateBookingDto } from './dto/create-booking.dto'; 
    import { CheckInDto } from './dto/check-in.dto';
import { BoardingStatus } from '@prisma/client';

@Injectable()
export class EventsService {
  constructor(private prisma: PrismaService) {}
private readonly logger = new Logger(EventsService.name);
async createEvent(userId: string, dto: CreateEventDto) {
  let organizer = await this.prisma.eventOrganizerProfile.findUnique({
    where: { userId },
  });

  if (!organizer) {
    organizer = await this.prisma.eventOrganizerProfile.create({
      data: {
        userId,
        organizationName: 'Independent Organizer',
      },
    });
  }

  try {
    return await this.prisma.event.create({
      data: {
        organizerId: organizer.id,
        title: dto.title,
        description: dto.description,
        venue: dto.venue,
        city: dto.city,
        state: dto.state,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        bannerUrl: dto.bannerUrl,
        status: 'PENDING_REVIEW',
        routes: {
          create: dto.routes.map((route) => ({
            originCity: route.originCity,
            destination: route.destination,
            price: 0,
            pickupPoints: {
              create: route.pickupPoints.map((point) => ({
                name: point.name,
                address: point.address,
                landmark: point.landmark,
                maxCapacity: point.maxCapacity || 40,
              })),
            },
          })),
        },
      },
      // Ensure your include block retrieves maxCapacity
      include: {
        routes: {
          include: {
            pickupPoints: {
              select: {
                id: true,
                name: true,
                address: true,
                landmark: true,
                maxCapacity: true, // <--- Crucial to return this to the frontend table
              },
            },
          },
        },
      },
    });
  } catch (error: any) {
    console.error('ERROR CREATING EVENT WITH ROUTES:', error?.message || error);
    throw error;
  }
}

  async getAllEvents() {
    return this.prisma.event.findMany({
      where: { status: 'PUBLISHED' },
      include: {
        organizer: true,
        routes: {
          include: {
            pickupPoints: true,
          },
        },
      },
      orderBy: { startDate: 'asc' },
    });
  }

  async getEventById(id: string) {
    const event = await this.prisma.event.findUnique({
      where: { id },
      include: {
        organizer: true,
        routes: {
          include: {
            pickupPoints: true,
            trips: {
              include: {
                driver: { include: { user: true } },
                vehicle: true,
              },
            },
          },
        },
      },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    return event;
  }



// Add this inside your EventsService class:

  async scheduleTrip(dto: CreateTripDto) {
    // 1. Verify that the route exists
    const route = await this.prisma.eventRoute.findUnique({
      where: { id: dto.routeId },
    });

    if (!route) {
      throw new NotFoundException('Event route not found');
    }

    // 2. Create the trip
    return this.prisma.eventTrip.create({
      data: {
        routeId: dto.routeId,
        vehicleId: dto.vehicleId,
        driverId: dto.driverId,
        tripLeg: dto.tripLeg,
        departureTime: new Date(dto.departureTime),
        arrivalTime: dto.arrivalTime ? new Date(dto.arrivalTime) : null,
        status: 'SCHEDULED',
      },
      include: {
        route: { include: { event: true } },
        vehicle: true,
        driver: { include: { user: true } },
      },
    });
  }



// Add this inside your EventsService class:


async bookEventTrip(customerId: string, dto: CreateBookingDto) {
  this.logger.log(`[bookEventTrip] Starting booking for customer: ${customerId}`);
  this.logger.debug(`[bookEventTrip] Payload DTO: ${JSON.stringify(dto)}`);

  // 1. Verify that the event, route, pickup point, and trip exist
  this.logger.log(`[bookEventTrip] Verifying Event ID: ${dto.eventId}`);
  const event = await this.prisma.event.findUnique({ where: { id: dto.eventId } });
  if (!event) {
    this.logger.warn(`[bookEventTrip] Validation failed: Event not found (${dto.eventId})`);
    throw new NotFoundException('Event not found');
  }

  this.logger.log(`[bookEventTrip] Verifying Route ID: ${dto.routeId}`);
  const route = await this.prisma.eventRoute.findUnique({ where: { id: dto.routeId } });
  if (!route) {
    this.logger.warn(`[bookEventTrip] Validation failed: Route not found (${dto.routeId})`);
    throw new NotFoundException('Route not found');
  }

  this.logger.log(`[bookEventTrip] Verifying Pickup Point ID: ${dto.pickupPointId}`);
  const pickupPoint = await this.prisma.pickupPoint.findUnique({ where: { id: dto.pickupPointId } });
  if (!pickupPoint) {
    this.logger.warn(`[bookEventTrip] Validation failed: Pickup point not found (${dto.pickupPointId})`);
    throw new NotFoundException('Pickup point not found');
  }

  this.logger.log(`[bookEventTrip] Verifying Trip ID: ${dto.tripId}`);
  const trip = await this.prisma.eventTrip.findUnique({ where: { id: dto.tripId } });
  if (!trip) {
    this.logger.warn(`[bookEventTrip] Validation failed: Trip not found (${dto.tripId})`);
    throw new NotFoundException('Trip not found');
  }

  this.logger.log(`[bookEventTrip] All validations passed. Starting Prisma transaction...`);

  // 2. Create the Booking and Payment record in a transaction
  try {
    const booking = await this.prisma.$transaction(async (tx) => {
      this.logger.log(`[Transaction] Creating EventBooking record...`);
      const createdBooking = await tx.eventBooking.create({
        data: {
          eventId: dto.eventId,
          customerId,
          routeId: dto.routeId,
          pickupPointId: dto.pickupPointId,
          tripId: dto.tripId,
          amountPaid: dto.amountPaid,
          paymentStatus: 'SUCCESS',
          boardingStatus: 'NOT_CHECKED_IN',
        },
        include: {
          event: true,
          route: true,
          pickupPoint: true,
          trip: { include: { vehicle: true } },
        },
      });

      this.logger.log(`[Transaction] EventBooking created (ID: ${createdBooking.id}). Creating EventPayment record...`);

      await tx.eventPayment.create({
        data: {
          bookingId: createdBooking.id,
          customerId,
          gateway: 'FLUTTERWAVE',
          txRef: `EVT-TX-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          amount: dto.amountPaid,
          currency: 'NGN',
          status: 'SUCCESS',
        },
      });

      this.logger.log(`[Transaction] EventPayment created successfully.`);
      return createdBooking;
    });

    this.logger.log(`[bookEventTrip] Successfully completed booking process for ID: ${booking.id}`);
    return booking;
  } catch (error) {
    this.logger.error(`[bookEventTrip] Transaction failed with error: ${(error as Error).message}`, (error as Error).stack);
    throw error;
  }
}

  async getCustomerBookings(customerId: string) {
    return this.prisma.eventBooking.findMany({
      where: { customerId },
      include: {
        event: true,
        route: true,
        pickupPoint: true,
        trip: {
          include: {
            vehicle: true,
            driver: { include: { user: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }


// Add this inside your EventsService class:

  async verifyAndCheckInPassenger(dto: CheckInDto) {
    // 1. Find the booking using the unique QR token
    const booking = await this.prisma.eventBooking.findUnique({
      where: { qrToken: dto.qrToken },
      include: {
        customer: true,
        event: true,
        pickupPoint: true,
        trip: true,
      },
    });

    if (!booking) {
      throw new NotFoundException('Invalid ticket or QR token not found');
    }

    // 2. Check if already checked in or boarded
    if (booking.boardingStatus === BoardingStatus.BOARDED || booking.boardingStatus === BoardingStatus.CHECKED_IN) {
      return {
        message: 'Passenger is already checked in!',
        status: booking.boardingStatus,
        booking,
      };
    }

    // 3. Update boarding status to CHECKED_IN
    const updatedBooking = await this.prisma.eventBooking.update({
      where: { id: booking.id },
      data: {
        boardingStatus: BoardingStatus.CHECKED_IN,
        checkedInAt: new Date(),
      },
      include: {
        customer: true,
        pickupPoint: true,
        trip: true,
      },
    });

    return {
      message: 'Check-in successful! Welcome aboard.',
      status: updatedBooking.boardingStatus,
      booking: updatedBooking,
    };
  }

  async getTripManifest(tripId: string) {
    const trip = await this.prisma.eventTrip.findUnique({
      where: { id: tripId },
      include: {
        route: { include: { event: true } },
        vehicle: true,
        driver: { include: { user: true } },
      },
    });

    if (!trip) {
      throw new NotFoundException('Trip not found');
    }

    const bookings = await this.prisma.eventBooking.findMany({
      where: { tripId },
      include: {
        customer: true,
        pickupPoint: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    return {
      trip,
      totalBooked: bookings.length,
      checkedInCount: bookings.filter((b) => b.boardingStatus === 'CHECKED_IN' || b.boardingStatus === 'BOARDED').length,
      passengers: bookings,
    };
  }

  async getAllOrganizerPassengers(userId: string) {
  const organizer = await this.prisma.eventOrganizerProfile.findUnique({
    where: { userId },
  });

  if (!organizer) {
    return [];
  }

  return this.prisma.eventBooking.findMany({
    where: {
      event: {
        organizerId: organizer.id,
      },
    },
    include: {
      customer: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phoneNumber: true,
        },
      },
      event: {
        select: {
          id: true,
          title: true,
          venue: true,
        },
      },
      route: {
        select: {
          originCity: true,
          destination: true,
        },
      },
      pickupPoint: {
        select: {
          name: true,
          address: true,
        },
      },
      trip: {
        select: {
          id: true,
          tripLeg: true,
          departureTime: true,
          vehicle: {
            select: {
              plateNumber: true,
              model: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
}

async getEventVehiclesAndDrivers(eventId: string) {
  // 1. Verify the event exists and fetch its routes
  const event = await this.prisma.event.findUnique({
    where: { id: eventId },
    include: {
      routes: {
        select: { id: true, originCity: true, destination: true, price: true },
      },
    },
  });

  if (!event) {
    throw new NotFoundException('Event not found.');
  }

  // Get all route IDs belonging to this event
  const routeIds = event.routes.map((r) => r.id);

  // 2. Query event trips directly using event route IDs
  const trips = await this.prisma.eventTrip.findMany({
    where: {
      routeId: { in: routeIds },
    },
    include: {
      route: {
        select: { id: true, originCity: true, destination: true, price: true },
      },
      vehicle: {
        select: {
          id: true,
          make: true,
          model: true,
          type: true,
          plateNumber: true,
          color: true,
          year: true,
          isVerified: true,
        },
      },
      driver: {
        include: {
          user: {
            select: {
              firstName: true,
              lastName: true,
              phoneNumber: true,
              avatarUrl: true,
            },
          },
        },
      },
    },
  });

  // 3. Transform data into a clean, frontend-friendly structure
  const formattedTrips = trips.map((trip) => ({
    tripId: trip.id,
    tripLeg: trip.tripLeg,
    status: trip.status,
    departureTime: trip.departureTime,
    arrivalTime: trip.arrivalTime,
    route: {
      routeId: trip.route.id,
      originCity: trip.route.originCity,
      destination: trip.route.destination,
      price: Number(trip.route.price),
    },
    vehicle: trip.vehicle
      ? {
          id: trip.vehicle.id,
          name: `${trip.vehicle.make} ${trip.vehicle.model} (${trip.vehicle.color || 'Standard'})`,
          type: trip.vehicle.type,
          plateNumber: trip.vehicle.plateNumber,
          isVerified: trip.vehicle.isVerified,
        }
      : null,
    driver: trip.driver
      ? {
          riderProfileId: trip.driver.id,
          name: `${trip.driver.user.firstName} ${trip.driver.user.lastName}`,
          phoneNumber: trip.driver.user.phoneNumber,
          avatarUrl: trip.driver.user.avatarUrl,
          rating: trip.driver.ratingAverage,
          isOnline: trip.driver.isOnline,
        }
      : null,
  }));

  return {
    eventId: event.id,
    eventTitle: event.title,
    totalTrips: formattedTrips.length,
    assignedVehiclesCount: formattedTrips.filter((t) => t.vehicle !== null).length,
    trips: formattedTrips,
  };
}

async getOrganizerReports(userId: string, range: string) {
  // 1. Get the organizer profile to find the correct profile ID
  const profile = await this.prisma.eventOrganizerProfile.findUnique({
    where: { userId },
  });

  // 2. Fetch events owned by this organizer (checking both profile ID and userId for safety)
  const events = await this.prisma.event.findMany({
    where: {
      OR: [
        ...(profile ? [{ organizerId: profile.id }] : []),
        { organizerId: userId },
      ],
    },
  });

  const eventIds = events.map(e => e.id);

  // 3. Fetch all event bookings for these events
  const bookings = await this.prisma.eventBooking.findMany({
    where: {
      eventId: { in: eventIds },
    },
  });

  let totalBookings = 0;
  let totalBoarded = 0;
  
  // Flexible check for active/published events (handles case sensitivity or drafts)
  const activeEvents = events.filter(e => {
    const status = e.status?.toUpperCase();
    return status === 'PUBLISHED' || status === 'ACTIVE';
  }).length;

  const eventAnalytics = events.map(event => {
    const eventBookings = bookings.filter(b => b.eventId === event.id);
    const bookedCount = eventBookings.length;
    
    const boardedCount = eventBookings.filter(
      b => b.boardingStatus === 'CHECKED_IN' || b.boardingStatus === 'BOARDED'
    ).length;

    totalBookings += bookedCount;
    totalBoarded += boardedCount;

    return {
      id: event.id,
      title: event.title,
      date: event.startDate,
      status: event.status,
      totalBookings: bookedCount,
      attendeesBoarded: boardedCount,
      checkInRate: bookedCount > 0 ? `${Math.round((boardedCount / bookedCount) * 100)}%` : '0%',
    };
  });

  return {
    metrics: {
      totalEvents: events.length,
      activeEvents,
      totalBookings,
      totalBoarded,
      overallCheckInRate: totalBookings > 0 ? `${Math.round((totalBoarded / totalBookings) * 100)}%` : '0%',
    },
    eventAnalytics,
    operationalReports: [],
  };
}
// In your service file
async getOrganizerSettings(userId: string) {
  // Fetch user details alongside their organizer profile
  const user = await this.prisma.user.findUnique({
    where: { id: userId },
    select: {
      firstName: true,
      lastName: true,
      email: true,
      organizerProfile: {
        select: {
          organizationName: true,
          supportEmail: true,
          supportPhone: true,
          logoUrl: true,
        },
      },
    },
  });

  if (!user) return null;

  // Flatten the response so the frontend receives a clean object
  return {
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    companyName: user.organizerProfile?.organizationName || '',
    supportEmail: user.organizerProfile?.supportEmail || '',
    supportPhone: user.organizerProfile?.supportPhone || '',
    logoUrl: user.organizerProfile?.logoUrl || '',
  };
}

async updateOrganizerSettings(
  userId: string,
  dto: { firstName?: string; lastName?: string; phone?: string; companyName?: string; supportEmail?: string }
) {
  // 1. Update user personal details
  await this.prisma.user.update({
    where: { id: userId },
    data: {
      firstName: dto.firstName,
      lastName: dto.lastName,
    },
  });

  // 2. Upsert the organizer profile (creates it if it doesn't exist yet, updates if it does)
  const profile = await this.prisma.eventOrganizerProfile.upsert({
    where: { userId },
    update: {
      organizationName: dto.companyName,
      supportPhone: dto.phone,
      supportEmail: dto.supportEmail,
    },
    create: {
      userId,
      organizationName: dto.companyName || 'My Organization',
      supportPhone: dto.phone,
      supportEmail: dto.supportEmail,
    },
  });

  return {
    success: true,
    profile,
  };
}
}