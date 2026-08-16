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

@Controller('events')
export class EventsController {
  constructor(
    private readonly eventsService: EventsService,
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
  async checkInPassenger(@Body() checkInDto: CheckInDto) {
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

  @Get('organizer')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async findAllByOrganizer(@Req() req) {
    const userId = req.user.id;
    const organizer = await this.eventsService['prisma'].eventOrganizerProfile.findUnique({
      where: { userId },
    });

    if (!organizer) {
      return [];
    }

    return this.eventsService['prisma'].event.findMany({
      where: { organizerId: organizer.id },
      include: {
        routes: {
          include: {
            pickupPoints: true,
            trips: {
              include: {
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
            },
          },
        },
        _count: {
          select: { bookings: true },
        },
      },
      orderBy: { startDate: 'desc' },
    });
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

  @Get(':id')
  async getEventById(@Param('id') id: string) {
    return this.eventsService.getEventById(id);
  }
}