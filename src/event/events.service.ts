import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../providers/database/prisma.service';
import { CreateEventDto } from './dto/create-event.dto';
  import { CreateTripDto } from '../admin/dto/create-trip.dto'; 
   import { CreateBookingDto } from './dto/create-booking.dto'; 
    import { CheckInDto } from './dto/check-in.dto';
import { BoardingStatus, TripStatus, TripLeg } from '@prisma/client';


@Injectable()
export class EventsService {
  constructor(private prisma: PrismaService) {}
private readonly logger = new Logger(EventsService.name);

private readonly stateTransitions: Record<TripStatus, TripStatus[]> = {
    [TripStatus.SCHEDULED]: [TripStatus.BOARDING],
    [TripStatus.BOARDING]: [TripStatus.IN_TRANSIT],
    [TripStatus.IN_TRANSIT]: [TripStatus.ARRIVED],
    [TripStatus.ARRIVED]: [TripStatus.COMPLETED],
    [TripStatus.COMPLETED]: [],
    [TripStatus.CANCELLED]: [],
  };



async createEvent(userId: string, dto: CreateEventDto) {
  let organizer = await this.prisma.eventOrganizerProfile.findUnique({
    where: { userId },
  });

if (!organizer) {
    organizer = await this.prisma.eventOrganizerProfile.create({
      data: {
        userId,
        organizationName: 'Independent Organizer',
        logoUrl: 'https://via.placeholder.com/150', // 👈 Required by database schema fallback
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
            trips: {
              include: {
                vehicle: true,
              },
            },
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

    // 2. Create the trip with commercial fares and driver payout
    return this.prisma.eventTrip.create({
      data: {
        routeId: dto.routeId,
        vehicleId: dto.vehicleId,
        driverId: dto.driverId,
        tripLeg: dto.tripLeg,
        departureTime: new Date(dto.departureTime),
        arrivalTime: dto.arrivalTime ? new Date(dto.arrivalTime) : null,
        customerOneWayFare: dto.customerOneWayFare,
        customerRoundTripFare: dto.customerRoundTripFare,
        driverPayout: dto.driverPayout,
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
async advanceTripState(
    tripId: string, 
    userId: string, // Auth user ID from JWT guard
    nextStatus: TripStatus,
  ) {
    // 1. Resolve the RiderProfile linked to this user
    const riderProfile = await this.prisma.riderProfile.findUnique({
      where: { userId },
    });

    if (!riderProfile) {
      throw new ForbiddenException('USER_IS_NOT_REGISTERED_AS_RIDER');
    }

    // 2. Fetch trip details and verify assignment
    const trip = await this.prisma.eventTrip.findUnique({
      where: { id: tripId },
      include: { bookings: true, route: true },
    });

    if (!trip) throw new NotFoundException('EVENT_TRIP_NOT_FOUND');
    if (trip.driverId !== riderProfile.id) {
      throw new ForbiddenException('UNAUTHORIZED_RIDER_TRIP_ACCESS');
    }

    // 3. Validate state machine rule
    const allowedNextStates = this.stateTransitions[trip.status] || [];
    if (!allowedNextStates.includes(nextStatus)) {
      throw new BadRequestException(`Invalid state transition from ${trip.status} to ${nextStatus}`);
    }

    // 4. Update trip status atomically
    const updatedTrip = await this.prisma.eventTrip.update({
      where: { id: tripId },
      data: {
        status: nextStatus,
        arrivalTime: nextStatus === TripStatus.ARRIVED ? new Date() : trip.arrivalTime,
      },
      include: {
        route: {
          include: { pickupPoints: true },
        },
        bookings: {
          include: { customer: true },
        },
      },
    });

    this.logger.log(`[TRIP_STATE_ADVANCED] Trip ${tripId} moved to ${nextStatus} by rider profile ${riderProfile.id}`);
    return updatedTrip;
  }

  /**
   * Scans and checks in a passenger via QR Token during the BOARDING state
   */
  async verifyAndCheckInPassenger(dto: CheckInDto) {
    console.log('>>> [DEBUG] Incoming CheckInDto:', dto);

    // 1. Find the booking
    const booking = await this.prisma.eventBooking.findFirst({
      where: {
        OR: [
          { qrToken: dto.qrToken },
          { id: dto.qrToken },
        ],
      },
      include: {
        customer: true,
        pickupPoint: true,
        trip: true,
      },
    });

    console.log('>>> [DEBUG] Found booking result:', booking ? booking.id : 'NOT FOUND');

    if (!booking) {
      throw new NotFoundException('Invalid ticket, QR token, or booking ID not found');
    }

    // 2. Validate trip ID if provided
    console.log('>>> [DEBUG] Comparing tripIds -> DTO tripId:', dto.tripId, '| Booking tripId:', booking.tripId);
    if (dto.tripId && booking.tripId && booking.tripId !== dto.tripId) {
      throw new BadRequestException('This ticket is valid for a different trip route.');
    }

    if (booking.boardingStatus === 'CHECKED_IN' || booking.boardingStatus === 'BOARDED') {
      console.log('>>> [DEBUG] Passenger already checked in.');
      return {
        message: 'Passenger is already checked in!',
        status: booking.boardingStatus,
        booking,
      };
    }

    const updatedBooking = await this.prisma.eventBooking.update({
      where: { id: booking.id },
      data: {
        boardingStatus: 'CHECKED_IN',
        checkedInAt: new Date(),
      },
      include: {
        customer: true,
        pickupPoint: true,
        trip: true,
      },
    });

    console.log('>>> [DEBUG] Check-in successful for booking:', updatedBooking.id);
    return {
      message: 'Check-in successful! Welcome aboard.',
      status: updatedBooking.boardingStatus,
      booking: updatedBooking,
    };
  }

  /**
   * Retrieves active event trip diagnostics, route metadata, and passengers manifest
   */
async getActiveEventTripDetails(tripId: string) {
    const trip = await this.prisma.eventTrip.findUnique({
      where: { id: tripId },
      include: {
        route: {
          include: {
            event: true,
            pickupPoints: true,
          },
        },
        bookings: {
          include: {
            customer: {
              select: {
                firstName: true,
                lastName: true,
                phoneNumber: true,
              },
            },
            pickupPoint: {
              select: {
                name: true,
              },
            },
          },
        },
        vehicle: true,
        driver: {
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true,
                phoneNumber: true,
              },
            },
          },
        },
      },
    });

    if (!trip) {
      throw new NotFoundException(`Event trip with ID ${tripId} not found`);
    }

    const tripAny = trip as any;

    return {
      ...trip,
      payout: tripAny.driverPayout ?? tripAny.payout ?? 0,
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

  // 1. Helper: Clean email to produce a readable name (e.g., "jeffburnhill237" -> "Jeff")
  const formatEmailAsName = (email: string) => {
    const username = email.split('@')[0];
    // Remove numbers and capitalize first letter
    const cleaned = username.replace(/[0-9]/g, '');
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  };

  return {
    // 2. Only use the fallback if firstName is empty
    firstName: user.firstName && user.firstName.trim() !== '' 
      ? user.firstName 
      : formatEmailAsName(user.email || 'User'),
    
    lastName: user.lastName || '',
    email: user.email,
    companyName: user.organizerProfile?.organizationName || '',
    supportEmail: user.organizerProfile?.supportEmail || '',
    supportPhone: user.organizerProfile?.supportPhone || '',
    logoUrl: user.organizerProfile?.logoUrl || '',
  };
}

async updateOrganizerSettings(
  userId: string,
  dto: { 
    firstName?: string; 
    lastName?: string; 
    phone?: string; 
    companyName?: string; 
    supportEmail?: string;
    logoUrl?: string; // 👈 Added so logo updates work from settings too
  }
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
      ...(dto.logoUrl && { logoUrl: dto.logoUrl }), // Only update logo if a new one is provided
    },
    create: {
      userId,
      organizationName: dto.companyName || 'My Organization',
      supportPhone: dto.phone,
      supportEmail: dto.supportEmail,
      logoUrl: dto.logoUrl || 'https://via.placeholder.com/150',
    },
  });

  return {
    success: true,
    profile,
  };
}

// src/event/events.service.ts

async joinWaitlist(userId: string, dto: { eventId: string; routeId: string; pickupPointId?: string }) {
  // 1. Verify if the route has active trips published. If trips exist, prevent joining the waitlist.
  const route = await this.prisma.eventRoute.findUnique({
    where: { id: dto.routeId },
    include: { trips: true },
  });

  if (route && route.trips && route.trips.length > 0) {
    throw new Error('Schedules for this route have already been published. Please proceed with booking your trip directly.');
  }

  // 2. Proceed with upserting the waitlist matching the existing Prisma schema fields
  return await this.prisma.routeWaitlist.upsert({
    where: {
      routeId_userId: {
        routeId: dto.routeId,
        userId: userId,
      },
    },
    update: {},
    create: {
      routeId: dto.routeId,
      userId: userId,
    },
  });
}
}