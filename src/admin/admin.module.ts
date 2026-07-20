import { Module, forwardRef } from '@nestjs/common';
import { PrismaService } from '../providers/database/prisma.service';
import { AdminController } from './admin.controller';
import { AdminConfigService } from './admin-config.service';
import { DashboardCacheService } from './dashboard-cache.service';
import { AdminFinanceService } from './finance.service';
import { AdminReportsService } from './reports.service';
import { AdminOperationsGateway } from './operations.gateway';
import { TrackingModule } from 'src/tracking/tracking.module'; // Import the module, not just the service

@Module({
  imports: [
    // forwardRef safeguards against circular loops between Admin and Tracking modules
    forwardRef(() => TrackingModule),
  ],
  controllers: [AdminController],
  providers: [
    PrismaService,
    AdminConfigService,
    DashboardCacheService,
    AdminFinanceService,
    AdminReportsService,
    AdminOperationsGateway,
    // Removed TrackingService from here; it is now supplied via TrackingModule imports
  ],
  exports: [
    AdminConfigService,
    DashboardCacheService,
    AdminFinanceService,
    AdminReportsService,
    AdminOperationsGateway, // Exported so TrackingService can inject it safely
  ],
})
export class AdminModule {}