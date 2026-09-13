import { Controller, Get, Post, Patch, Body, Param, Query, BadRequestException, InternalServerErrorException, NotFoundException, UseGuards } from '@nestjs/common';
import { PrismaService } from '../providers/database/prisma.service';
import { DashboardCacheService } from './dashboard-cache.service';
import { RiderApplicationStatus, IdentityStatus, ShipmentStatus, User, KycStatus, UserRole } from '@prisma/client';
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
import { Roles } from '../auth/decorators/roles.decorator';
import { AdminEventsService } from './admin-events.service';
import { CreateTripDto, UpdateRouteCoordinatesDto } from './dto/create-trip.dto';
import { AdminMerchantService } from './admin-merchant.service';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminController {
  constructor(
    private readonly adminBroadcastService: AdminBroadcastService,
    private readonly operationsGateway: AdminOperationsGateway,
    private readonly prisma: PrismaService,
    private readonly cacheService: DashboardCacheService,
    private readonly trackingService: TrackingService,
    private readonly financeService: AdminFinanceService,
    private readonly reportsService: AdminReportsService,
    private readonly notificationService: NotificationService,
    private readonly adminEventsService: AdminEventsService,
    private readonly adminMerchantService: AdminMerchantService,
  ) {}

  /**
   * 1. DASHBOARD & ANALYTICS
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
   * 2. SHIPMENTS PIPELINE
   */
  @Get('shipments')
  async getShipments(
    @Query('status') status?: ShipmentStatus,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('search') search?: string,
  ) {
    const skip = (Number(page) - 1) * Number(limit);
    const where: any = {};

    if (status) where.status = status;
    if (search) {
      where.OR = [
        { id: search },
        { trackingCode: { contains: search, mode: 'insensitive' } },
        { recipientPhone: { contains: search } },
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
          rider: { select: { user: { select: { firstName: true, lastName: true } } } },
        },
      }),
      this.prisma.shipment.count({ where }),
    ]);

    return { records, meta: { total, page: Number(page), limit: Number(limit) } };
  }

  /**
   * 3. RIDER ONBOARDING & PIPELINE
   */
  @Get('riders/pending-kyc')
  async getPendingKYCApplications(@Query('page') page = 1, @Query('limit') limit = 20) {
    const skip = (Number(page) - 1) * Number(limit);
    
    return this.prisma.riderApplication.findMany({
      where: { status: RiderApplicationStatus.SUBMITTED },
      skip,
      take: Number(limit),
      orderBy: { submittedAt: 'desc' },
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
      if (!app) {
        throw new BadRequestException('Target application record is unavailable for review.');
      }

      if (app.status === RiderApplicationStatus.APPROVED && approve) {
        throw new BadRequestException('This application has already been approved.');
      }

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

      let targetUser: User | null = null;
      if (app.userId) {
        targetUser = await tx.user.findUnique({ where: { id: app.userId } });
      }

      if (!targetUser && app.email) {
        targetUser = await tx.user.findFirst({
          where: { email: { equals: app.email.trim(), mode: 'insensitive' } },
        });
      }

      if (!targetUser) {
        const userEmail = app.email ? app.email.trim().toLowerCase() : `rider_${app.id}@aviore.com`;
        const userPhone =
          (app as any).phoneNumber || (app as any).phone || `0000000000_${app.id.substring(0, 5)}`;

        try {
          targetUser = await tx.user.create({
            data: {
              firstName: app.firstName || 'Rider',
              lastName: app.lastName || 'Operator',
              email: userEmail,
              phoneNumber: userPhone,
              passwordHash: 'KYC_APPROVED_EXTERNAL_AUTH',
              role: UserRole.RIDER,
              status: IdentityStatus.VERIFIED,
            },
          });
        } catch (e) {
          targetUser = await tx.user.findFirst({
            where: { OR: [{ email: userEmail }, { phoneNumber: userPhone }] },
          });
          if (!targetUser) throw e;

          targetUser = await tx.user.update({
            where: { id: targetUser.id },
            data: { status: IdentityStatus.VERIFIED },
          });
        }
      } else {
        targetUser = await tx.user.update({
          where: { id: targetUser.id },
          data: { status: IdentityStatus.VERIFIED },
        });
      }

      const updatedApp = await tx.riderApplication.update({
        where: { id: appId },
        data: {
          status: RiderApplicationStatus.APPROVED,
          reviewedBy: adminId || null,
          reviewedAt: new Date(),
          userId: targetUser.id,
        },
      });

      const riderProfile = await tx.riderProfile.upsert({
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

      let activeVehicleId: string | undefined = undefined;
      const vehicleTypeVal = app.vehicleType;
      const plateNumberVal = app.plateNumber || `AVR-${Math.floor(1000 + Math.random() * 9000)}`;

      if (vehicleTypeVal) {
        const vehicleData = {
          ownerId: riderProfile.id,
          type: vehicleTypeVal,
          make: app.vehicleBrand || 'Unknown',
          model: app.vehicleModel || 'Unknown',
          year: app.vehicleYear ? Number(app.vehicleYear) : null,
          color: app.vehicleColor || null,
          plateNumber: plateNumberVal,
          isVerified: true,
        };

        const existingVehicle = await tx.vehicle.findFirst({
          where: { plateNumber: plateNumberVal },
        });

        if (existingVehicle) {
          const updatedVehicle = await tx.vehicle.update({
            where: { id: existingVehicle.id },
            data: vehicleData,
          });
          activeVehicleId = updatedVehicle.id;
        } else {
          const newVehicle = await tx.vehicle.create({
            data: vehicleData,
          });
          activeVehicleId = newVehicle.id;
        }

        await tx.riderProfile.update({
          where: { id: riderProfile.id },
          data: { activeVehicleId },
        });
      }

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

  @Patch('riders/:riderId/status')
  async updateRiderStatus(
    @Param('riderId') riderId: string,
    @Body('action') action: 'SUSPEND' | 'APPROVE' | 'BAN',
  ) {
    let targetStatus: IdentityStatus = IdentityStatus.VERIFIED;

    if (action === 'SUSPEND' || action === 'BAN') {
      targetStatus = IdentityStatus.SUSPENDED;
    } else if (action === 'APPROVE') {
      targetStatus = IdentityStatus.VERIFIED;
    }

    const riderProfile = await this.prisma.riderProfile.findFirst({
      where: { OR: [{ id: riderId }, { userId: riderId }] },
    });

    if (!riderProfile) {
      throw new NotFoundException('Rider profile not found.');
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: riderProfile.userId },
      data: { status: targetStatus },
    });

    return {
      success: true,
      message: `Rider successfully marked as ${action}`,
      status: updatedUser.status,
    };
  }

  @Get('riders/tracking')
  async getLiveTrackingView() {
    return await this.trackingService.getLiveFleetData();
  }

  @Get('riders')
  async getAllFleetRiders() {
    return await this.cacheService.getAllRiders();
  }

  @Get('riders/:id')
  async getSingleFleetRider(@Param('id') id: string) {
    return await this.cacheService.getRiderById(id);
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
        create: { key, value },
      }),
    );

    await this.prisma.$transaction(mutations);
    await this.cacheService.forceHydrate();
    return { success: true, message: 'Pricing configurations updated successfully.' };
  }

  /**
   * 5. CUSTOMERS MANIFEST
   */
  @Get('customers')
  async getCustomersList() {
    return await this.cacheService.getAllCustomers();
  }

  @Get('customers/:id')
  async getSingleCustomer(@Param('id') id: string) {
    const customerProfile = await this.cacheService.getCustomerById(id);
    if (!customerProfile) {
      throw new NotFoundException(`Customer record reference profile matching key "${id}" not found.`);
    }
    return customerProfile;
  }

  /**
   * 6. FINANCE & LEDGER
   */
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

  /**
   * 7. BROADCASTS
   */
  @Post('broadcast')
  async sendBroadcast(@GetUser() adminUser: any, @Body() dto: AdminBroadcastDto) {
    return this.adminBroadcastService.sendBroadcast(dto, adminUser.id);
  }

  /**
   * 8. EVENTS & TRANSIT OPERATIONS
   */
  @Get('events')
  async getAllAdminEvents() {
    return this.adminEventsService.getAllEvents();
  }

  @Get('pending')
  async getPendingEvents() {
    return this.adminEventsService.getPendingEvents();
  }

  @Patch('events/:id/accept')
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

  @Patch('events/routes/:id/coordinates')
  async updateRouteCoordinates(
    @Param('id') routeId: string,
    @Body() dto: UpdateRouteCoordinatesDto,
  ) {
    return this.adminEventsService.updateRouteCoordinates(routeId, dto);
  }

  /**
   * 9. MERCHANT MANAGEMENT (DEDICATED PREFIX TO PREVENT COLLISION WITH WILDCARDS)
   */
  @Get('merchants')
  async getAllMerchants() {
    return this.adminMerchantService.getAllMerchants();
  }

  @Get('merchants/:id')
  async getMerchantById(@Param('id') id: string) {
    return this.adminMerchantService.getMerchantById(id);
  }

  @Patch('merchants/:id/status')
  async updateMerchantStatus(
    @Param('id') id: string,
    @Body('kycStatus') kycStatus: KycStatus,
  ) {
    return this.adminMerchantService.updateMerchantStatus(id, kycStatus);
  }

  /**
   * 10. WILDCARD CATCH-ALLS (MUST REMAIN AT THE VERY BOTTOM OF THE FILE)
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
}