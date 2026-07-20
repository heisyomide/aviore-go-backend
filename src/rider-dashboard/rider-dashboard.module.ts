import { Module } from '@nestjs/common';

import { RiderDashboardController } from './rider-dashboard.controller';
import { RiderDashboardService } from './rider-dashboard.service';

@Module({
  controllers: [RiderDashboardController],
  providers: [RiderDashboardService],
})
export class RiderDashboardModule {}