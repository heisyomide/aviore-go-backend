import { Module, forwardRef } from '@nestjs/common';
import { PrismaService } from '../providers/database/prisma.service';
import { AdminController } from './admin.controller';
import { AdminConfigService } from './admin-config.service';
import { DashboardCacheService } from './dashboard-cache.service';
import { AdminFinanceService } from './finance.service';
import { AdminReportsService } from './reports.service';
import { AdminOperationsGateway } from './operations.gateway';
import { AdminBroadcastService } from './admin-broadcast.service';
import { AdminEventsService } from './admin-events.service'; // <-- 1. Import it here
import { TrackingModule } from 'src/tracking/tracking.module';
import { NotificationModule } from 'src/notification/notification.module';
import { FlutterwaveModule } from 'src/flutterwave/flutterwave.module';

@Module({
  imports: [
    NotificationModule,
    FlutterwaveModule,
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
    AdminBroadcastService,
    AdminEventsService, // <-- 2. Register it as a provider
  ],
  exports: [
    AdminConfigService,
    DashboardCacheService,
    AdminFinanceService,
    AdminReportsService,
    AdminOperationsGateway,
    AdminBroadcastService,
    AdminEventsService, // <-- 3. Export it (optional, but good practice)
  ],
})
export class AdminModule {}