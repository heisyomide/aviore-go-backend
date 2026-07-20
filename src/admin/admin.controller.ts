import { Controller, Get, Post, Patch, Body, Param, Query, BadRequestException, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../providers/database/prisma.service';
import { DashboardCacheService } from './dashboard-cache.service';
import { RiderApplicationStatus, IdentityStatus, ShipmentStatus } from '@prisma/client';
import { AdminOperationsGateway } from './operations.gateway';
import { TrackingService } from 'src/tracking/tracking.service';
import { AdminFinanceService } from './finance.service';
import { AdminReportsService } from './reports.service';
 // <-- 1. Import your customer service

@Controller('admin')
export class AdminController {
  constructor(
    private readonly operationsGateway: AdminOperationsGateway,
    private prisma: PrismaService,
    private cacheService: DashboardCacheService,
    private readonly trackingService: TrackingService,
    private readonly financeService: AdminFinanceService, 
    private readonly reportsService: AdminReportsService,// <-- 2. Inject it here
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
    @Body('reason') reason?: string
  ) {
    return this.prisma.$transaction(async (tx) => {
      const app = await tx.riderApplication.findUnique({ where: { id: appId } });
      if (!app || app.status !== RiderApplicationStatus.SUBMITTED) {
        throw new BadRequestException('Target application record is unavailable for review.');
      }

      if (!approve) {
        return tx.riderApplication.update({
          where: { id: appId },
          data: {
            status: RiderApplicationStatus.REJECTED,
            reviewedBy: adminId,
            reviewedAt: new Date(),
            rejectionReason: reason || 'Submitted tracking credentials could not be verified.'
          }
        });
      }

      const targetUser = await tx.user.findUnique({ where: { email: app.email! } });
      if (!targetUser) throw new BadRequestException('Relational user account details not found.');

      await tx.user.update({
        where: { id: targetUser.id },
        data: { status: IdentityStatus.VERIFIED }
      });

      const updatedApp = await tx.riderApplication.update({
        where: { id: appId },
        data: { status: RiderApplicationStatus.APPROVED, reviewedBy: adminId, reviewedAt: new Date() }
      });

      await tx.riderProfile.upsert({
        where: { userId: targetUser.id },
        update: {
          nin: app.idNumber,
          accountNumber: app.accountNumber,
          bankName: app.bankName,
          bankCode: app.bankCode,
          accountName: app.accountName
        },
        create: {
          userId: targetUser.id,
          nin: app.idNumber,
          accountNumber: app.accountNumber,
          bankName: app.bankName,
          bankCode: app.bankCode,
          accountName: app.accountName
        }
      });

      return updatedApp;
    });
  }

  /**
   * 4. PRICING ENGINE CONFIG: Synchronous lookups and modifications
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
   * 6. CUSTOMERS MANIFEST: Matches frontend plural URL parameters perfectly
   */
  @Get('customers') // <-- Changed path to plural 'customers'
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

  /**
   * GET /admin/riders/:id
   * Target single deep structural data node match for active profile tracking lookups
   */
  @Get('riders/:id')
  async getSingleFleetRider(@Param('id') id: string) {
    return await this.cacheService.getRiderById(id);
  }
  /**
   * 7. WILDCARD CATCH-ALLS (MUST REMAIN AT THE BOTTOM OF THE FILE)
   * Prevents standard strings like 'customers' or 'riders' from getting swallowed.
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