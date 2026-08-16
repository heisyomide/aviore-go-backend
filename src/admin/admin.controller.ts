import { Controller, Get, Post, Patch, Body, Param, Query, BadRequestException, InternalServerErrorException, NotFoundException, UseGuards, Req } from '@nestjs/common';
import { PrismaService } from '../providers/database/prisma.service';
import { DashboardCacheService } from './dashboard-cache.service';
import { RiderApplicationStatus, Prisma, IdentityStatus, ShipmentStatus, User } from '@prisma/client';
import { AdminOperationsGateway } from './operations.gateway';
import { TrackingService } from 'src/tracking/tracking.service';
import { AdminFinanceService } from './finance.service';
import { AdminReportsService } from './reports.service';
import { NotificationService } from '../notification/notification.service';
import { NotificationType } from '../notification/dto/send-notification.dto';
import { AdminBroadcastDto } from './dto/broadcast.dto';
import { AdminBroadcastService } from './admin-broadcast.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { AdminEventsService } from './admin-events.service';
import { CreateTripDto, UpdateRouteCoordinatesDto } from './dto/create-trip.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminController {
  constructor(
    private readonly adminBroadcastService: AdminBroadcastService,
    private readonly operationsGateway: AdminOperationsGateway,
    private prisma: PrismaService,
    private cacheService: DashboardCacheService,
    private readonly trackingService: TrackingService,
    private readonly financeService: AdminFinanceService, 
    private readonly reportsService: AdminReportsService,
    private readonly notificationService: NotificationService,
    private readonly adminEventsService: AdminEventsService,
  ) {}

  /**
   * 1. DASHBOARD OVERVIEW: Fetches cached operational data metrics
   */
  @Get('dashboard/overview')
  async getOverviewMetrics() {
    return this.cacheService.getMetrics();
  }

  @Get('analytics/summary')
  async getAnalyticalIntelligenceSnapshot() {
    return await this.reportsService.compileAnalyticalReportsSummary();
  }

  /**
   * 2. SHIPMENTS PIPELINE: Paginated query infrastructure
   */
  @Get('shipments')
  async getShipments(
    @Query('status') status?: ShipmentStatus,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('search') search?: string
  ) {
    const skip = (Number(page) - 1) * Number(limit);
    const where: any = {};

    if (status) where.status = status;
    if (search) {
      where.OR = [
        { id: search },
        { trackingCode: { contains: search, mode: 'insensitive' } },
        { recipientPhone: { contains: search } }
      ];
    }

    const [records, total] = await Promise.all([
      this.prisma.shipment.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          customer: { select: { firstName: true, lastName: true, email: true } },
          rider: { select: { user: { select: { firstName: true, lastName: true } } } }
        }
      }),
      this.prisma.shipment.count({ where })
    ]);

    return { records, meta: { total, page: Number(page), limit: Number(limit) } };
  }

  /**
   * 3. RIDER SEPARATED PIPELINE: Segregated onboarding application processing
   */
  @Get('riders/pending-kyc')
  async getPendingKYCApplications(@Query('page') page = 1, @Query('limit') limit = 20) {
    const skip = (Number(page) - 1) * Number(limit);
    
    return this.prisma.riderApplication.findMany({
      where: { status: RiderApplicationStatus.SUBMITTED },
      skip,
      take: Number(limit),
      orderBy: { submittedAt: 'desc' }
    });
  }

  @Patch('riders/kyc/:applicationId/evaluate')
  async evaluateRiderKYC(
    @Param('applicationId') appId: string,
    @Body('approve') approve: boolean,
    @Body('adminId') adminId: string,
    @Body('reason') reason?: string,
  ) {
    const result = await this.prisma.$transaction(async (tx) => {
      const app = await tx.riderApplication.findUnique({ where: { id: appId } });
      if (!app || app.status !== RiderApplicationStatus.SUBMITTED) {
        throw new BadRequestException('Target application record is unavailable for review.');
      }

      // 1. REJECTION FLOW
      if (!approve) {
        const rejectedApp = await tx.riderApplication.update({
          where: { id: appId },
          data: {
            status: RiderApplicationStatus.REJECTED,
            reviewedBy: adminId || null,
            reviewedAt: new Date(),
            rejectionReason: reason || 'Submitted credentials could not be verified.',
          },
        });

        if (app.email) {
          this.notificationService
            .dispatch({
              type: NotificationType.LOGIN_ALERT,
              userId: app.userId || '',
              email: app.email,
              title: 'Rider Application Update',
              body: `Hello ${app.firstName || 'Rider'}, your application could not be approved. Reason: ${
                reason || 'Submitted credentials could not be verified.'
              }`,
            })
            .catch((err) => console.error('[KYC REJECTION EMAIL FAILED]', err));
        }

        return { app: rejectedApp, user: null, approved: false };
      }

      // 2. LOCATE USER
      let targetUser: User | null = null;

      if (app.userId) {
        targetUser = await tx.user.findUnique({ where: { id: app.userId } });
      }

      if (!targetUser) {
        const searchConditions: Prisma.UserWhereInput[] = [];

        if (app.email) {
          searchConditions.push({
            email: { equals: app.email.trim(), mode: 'insensitive' },
          });
        }

        if ((app as any).phoneNumber || (app as any).phone) {
          searchConditions.push({
            phoneNumber: (app as any).phoneNumber || (app as any).phone,
          });
        }

        if (searchConditions.length > 0) {
          targetUser = await tx.user.findFirst({
            where: { OR: searchConditions },
          });
        }
      }

      // 3. AUTO-CREATE USER IF STILL NOT FOUND
      if (!targetUser) {
        const userEmail = app.email ? app.email.trim().toLowerCase() : `rider_${app.id}@aviore.com`;
        const userPhone =
          (app as any).phoneNumber || (app as any).phone || `0000000000_${app.id.substring(0, 5)}`;

        targetUser = await tx.user.create({
          data: {
            firstName: app.firstName || 'Rider',
            lastName: app.lastName || 'Operator',
            email: userEmail,
            phoneNumber: userPhone,
            passwordHash: 'KYC_APPROVED_EXTERNAL_AUTH',
            role: 'RIDER' as any,
            status: IdentityStatus.VERIFIED,
          },
        });
      } else {
        targetUser = await tx.user.update({
          where: { id: targetUser.id },
          data: { status: IdentityStatus.VERIFIED },
        });
      }

      // 4. UPDATE APPLICATION STATUS
      const updatedApp = await tx.riderApplication.update({
        where: { id: appId },
        data: {
          status: RiderApplicationStatus.APPROVED,
          reviewedBy: adminId || null,
          reviewedAt: new Date(),
          userId: targetUser.id,
        },
      });

      // 5. UPSERT RIDER PROFILE
      await tx.riderProfile.upsert({
        where: { userId: targetUser.id },
        update: {
          nin: app.idNumber || undefined,
          accountNumber: app.accountNumber || undefined,
          bankName: app.bankName || undefined,
          bankCode: app.bankCode || undefined,
          accountName: app.accountName || undefined,
        },
        create: {
          userId: targetUser.id,
          nin: app.idNumber || '',
          accountNumber: app.accountNumber || '',
          bankName: app.bankName || '',
          bankCode: app.bankCode || '',
          accountName: app.accountName || '',
        },
      });

      return { app: updatedApp, user: targetUser, approved: true };
    });

    if (result.approved && result.user) {
      this.notificationService
        .dispatch({
          type: NotificationType.LOGIN_ALERT,
          userId: result.user.id,
          email: result.user.email,
          title: 'Account Validated!',
          body: `Hello ${
            result.user.firstName || 'Rider'
          }, your account is now confirmed and validated! You are all set to start taking orders on Aviorè Go.`,
        })
        .catch((err) => console.error('[ACCOUNT VALIDATED EMAIL FAILED]', err));
    }

    return result.app;
  }

  /**
   * 4. PRICING ENGINE CONFIG
   */
  @Post('pricing-engine/save')
  async saveConfigMatrix(@Body() configurationParameters: Record<string, string>) {
    const mutations = Object.entries(configurationParameters).map(([key, value]) =>
      this.prisma.globalConfig.upsert({
        where: { key },
        update: { value },
        create: { key, value }
      })
    );

    await this.prisma.$transaction(mutations);
    await this.cacheService.forceHydrate(); 
    return { success: true, message: 'Pricing configurations updated successfully.' };
  }

  /**
   * 5. LIVE TRACKING
   */
  @Get('riders/tracking')
  async getLiveTrackingView() {
    return await this.trackingService.getLiveFleetData();
  }

  /**
   * 6. CUSTOMERS MANIFEST
   */
  @Get('customers')
  async getCustomersList() {
    return await this.cacheService.getAllCustomers();
  }

  @Get('finances/overview')
  async getFinanceMetrics() {
    return await this.financeService.getFinanceOverview();
  }

  @Get('finances/transactions')
  async getRecentLedgerTransactions() {
    return await this.financeService.getRecentTransactions();
  }

  @Get('finances/withdrawals')
  async getPendingWithdrawalLines() {
    return await this.financeService.getPendingWithdrawals();
  }

  @Patch('finances/withdrawals/:id/approve')
  async approveRiderPayout(@Param('id') id: string) {
    return await this.financeService.approveWithdrawal(id, 'SYSTEM_ADMIN_UI');
  }

  @Patch('finances/withdrawals/:id/reject')
  async rejectRiderPayout(@Param('id') id: string) {
    return await this.financeService.rejectWithdrawal(id, 'SYSTEM_ADMIN_UI');
  }

  @Get('customers/:id')
  async getSingleCustomer(@Param('id') id: string) {
    const customerProfile = await this.cacheService.getCustomerById(id);
    
    if (!customerProfile) {
      throw new NotFoundException(`Customer record reference profile matching key "${id}" not found.`);
    }
    
    return customerProfile;
  }

  @Get('riders')
  async getAllFleetRiders() {
    return await this.cacheService.getAllRiders();
  }

  @Get('riders/:id')
  async getSingleFleetRider(@Param('id') id: string) {
    return await this.cacheService.getRiderById(id);
  }

  @Post('broadcast')
  async sendBroadcast(
    @GetUser() adminUser: any,
    @Body() dto: AdminBroadcastDto,
  ) {
    return this.adminBroadcastService.sendBroadcast(dto, adminUser.id);
  }

  /**
   * 7. EVENTS & TRANSIT OPERATIONS
   */
  @Get('events')
  async getAllAdminEvents() {
    return this.adminEventsService.getAllEvents();
  }

  @Get('pending')
  async getPendingEvents() {
    return this.adminEventsService.getPendingEvents();
  }

  @Patch(':id/accept')
  async acceptEvent(@Param('id') id: string) {
    return this.adminEventsService.acceptEvent(id);
  }

  @Get('events/accepted')
  async getAcceptedUnscheduledEvents() {
    return this.adminEventsService.getAcceptedUnscheduledEvents();
  }

  @Post('trips')
  async scheduleTrip(@Body() dto: CreateTripDto) {
    return this.adminEventsService.scheduleTrip(dto);
  }

  @Patch('trips/:id/publish-live')
  async publishTripLive(@Param('id') id: string) {
    return this.adminEventsService.publishTripLive(id);
  }
  
  
  /**
   * 8. WILDCARD CATCH-ALLS (MUST REMAIN AT THE BOTTOM OF THE FILE)
   */
  @Get(':id')
  async getShipmentDetails(@Param('id') id: string) {
    try {
      const shipment = await this.cacheService.findDetailsById(id);
      
      if (!shipment) {
        throw new NotFoundException(`Shipment matrix with target key matching "${id}" not found.`);
      }
      
      return shipment;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException('Fatal failure during backend manifest ingestion workflow.');
    }
  }

  @Patch(':id/coordinates')
async updateRouteCoordinates(
  @Param('id') routeId: string,
  @Body() dto: UpdateRouteCoordinatesDto,
) {
  return this.adminEventsService.updateRouteCoordinates(routeId, dto);
}
}