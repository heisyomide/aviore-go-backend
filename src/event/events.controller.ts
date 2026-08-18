import { Controller, Get, Post, Body, Param, UseGuards, Req, NotFoundException, Query, Patch } from '@nestjs/common';
import { EventsService } from './events.service';
import { DashboardService } from './dashboard.service';
import { CreateEventDto } from './dto/create-event.dto';
import { CreateTripDto } from '../admin/dto/create-trip.dto';
import { CreateBookingDto } from './dto/create-booking.dto';
import { CheckInDto } from './dto/check-in.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { EventRiderJobsService } from './EventRiderJobsService';

@Controller('events')
export class EventsController {
  constructor(
    private readonly eventsService: EventsService,
    private readonly eventRiderJobsService: EventRiderJobsService,
    private readonly dashboardService: DashboardService,
  ) {}

  // ==========================================
  // 1. PUBLIC & DISCOVERY ROUTES
  // ==========================================

  @Get()
  async getAllEvents() {
    return this.eventsService.getAllEvents();
  }

  // ==========================================
  // 2. CREATION & SCHEDULING ROUTES (PROTECTED)
  // ==========================================

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async createEvent(@Req() req, @Body() createEventDto: CreateEventDto) {
    const userId = req.user.id;
    return this.eventsService.createEvent(userId, createEventDto);
  }

  @Post('trips')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async scheduleTrip(@Body() createTripDto: CreateTripDto) {
    return this.eventsService.scheduleTrip(createTripDto);
  }

  // ==========================================
  // 3. BOOKINGS & TICKETING ROUTES
  // ==========================================

  @Post('bookings')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CUSTOMER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async bookEventTrip(@Req() req, @Body() createBookingDto: CreateBookingDto) {
    const customerId = req.user.id;
    return this.eventsService.bookEventTrip(customerId, createBookingDto);
  }

  @Get('bookings/my-tickets')
  @UseGuards(JwtAuthGuard)
  async getMyBookings(@Req() req) {
    const customerId = req.user.id;
    return this.eventsService.getCustomerBookings(customerId);
  }

  // ==========================================
  // 4. CHECK-IN & MANIFEST ROUTES
  // ==========================================

 @Post('check-in')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ORGANIZER, UserRole.RIDER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
async checkInPassenger(@Req() req: any, @Body() checkInDto: CheckInDto) {
  console.log('USER MAKING CHECK-IN:', req.user);
  return this.eventsService.verifyAndCheckInPassenger(checkInDto);
}

  @Get('trips/:tripId/manifest')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER, UserRole.RIDER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getTripManifest(@Param('tripId') tripId: string) {
    return this.eventsService.getTripManifest(tripId);
  }

  // src/event/events.controller.ts

@Post('waitlist')
@UseGuards(JwtAuthGuard)
async joinWaitlist(
  @Body() dto: { eventId: string; routeId: string; pickupPointId?: string },
  @Req() req,
) {
  const userId = req.user.id;
  return await this.eventsService.joinWaitlist(userId, dto);
}

  // ==========================================
  // 5. ORGANIZER DASHBOARD & MANAGEMENT ROUTES
  // ==========================================

 @Get('organizer/active-trips')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async findOrganizerActiveTrips(@Req() req) {
    const userId = req.user.id;
    const organizer = await this.eventsService['prisma'].eventOrganizerProfile.findUnique({
      where: { userId },
    });

    if (!organizer) {
      return [];
    }

    // Find all trips belonging to routes owned by this organizer's events
    return this.eventsService['prisma'].eventTrip.findMany({
      where: {
        route: {
          event: {
            organizerId: organizer.id,
          },
        },
      },
      include: {
        route: {
          include: {
            event: {
              select: {
                id: true,
                title: true,
                venue: true,
                city: true,
                state: true,
                startDate: true,
                endDate: true,
              },
            },
            pickupPoints: true,
          },
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
        bookings: {
          include: {
            customer: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                phoneNumber: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Individual Active Trip endpoint matching organizerTripsService.getActiveEventTripDetails(tripId)
  @Get('organizer/trips/:tripId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async findOrganizerTripDetails(@Req() req, @Param('tripId') tripId: string) {
    const userId = req.user.id;
    const organizer = await this.eventsService['prisma'].eventOrganizerProfile.findUnique({
      where: { userId },
    });

    if (!organizer) {
      throw new NotFoundException('Organizer profile not found');
    }

    const trip = await this.eventsService['prisma'].eventTrip.findFirst({
      where: {
        id: tripId,
        route: {
          event: {
            organizerId: organizer.id,
          },
        },
      },
      include: {
        route: {
          include: {
            event: true,
            pickupPoints: true,
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
                avatarUrl: true,
              },
            },
          },
        },
        bookings: {
          include: {
            customer: {
              select: {
                id: true,
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
      throw new NotFoundException('Trip not found or unauthorized');
    }

    return trip;
  }

  @Get('dashboard/overview')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getDashboardOverview(@Req() req: any) {
    const userId = req.user.id;
    return await this.dashboardService.getOrganizerMetrics(userId);
  }

  @Get('organizer/passengers')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getAllOrganizerPassengers(@Req() req) {
    const userId = req.user.id;
    return this.eventsService.getAllOrganizerPassengers(userId);
  }

  @Get('reports/summary')
  @UseGuards(JwtAuthGuard)
  async getOrganizerReports(@GetUser() user: any, @Query('range') range: string) {
    return this.eventsService.getOrganizerReports(user.userId, range);
  }

  @Get('organizer/settings')
  @UseGuards(JwtAuthGuard)
  async getOrganizerSettings(@GetUser() user: any) {
    return this.eventsService.getOrganizerSettings(user.userId);
  }

  // In events.controller.ts
@Get('trips/:tripId/active-details')
@UseGuards(JwtAuthGuard)
async getActiveTripDetails(@Param('tripId') tripId: string) {
  return await this.eventsService.getActiveEventTripDetails(tripId);
}

  @Patch('organizer/settings')
  @UseGuards(JwtAuthGuard)
  async updateOrganizerSettings(
    @GetUser() user: any,
    @Body() dto: { firstName?: string; lastName?: string; phone?: string; companyName?: string },
  ) {
    return this.eventsService.updateOrganizerSettings(user.userId, dto);
  }

  // ==========================================
  // 6. PARAMETRIC ROUTES (MUST BE ABSOLUTELY LAST)
  // ==========================================

  @Get(':eventId/vehicles')
  async getEventVehicles(@Param('eventId') eventId: string) {
    return await this.eventsService.getEventVehiclesAndDrivers(eventId);
  }
  @Post('trips/:tripId/accept')
  @UseGuards(JwtAuthGuard) // Make sure authentication guard is protecting it so req.user exists!
  async acceptEventTrip(
    @Param('tripId') tripId: string,
    @Req() req: any,
  ) {
    const userId = req.user.id;
    return await this.eventRiderJobsService.acceptEventTrip(tripId, userId);
  }
  @Get(':id')
  async getEventById(@Param('id') id: string) {
    return this.eventsService.getEventById(id);
  }

  
@Get('trips/accepted')
  @UseGuards(JwtAuthGuard)
  async getAcceptedEventTrips(@Req() req: any) {
    // Safely extract user ID depending on how your JWT strategy populates the request object
    const userId = req.user?.id || req.user?.userId;
    return await this.eventRiderJobsService.getAcceptedEventTrips(userId);
  }
}