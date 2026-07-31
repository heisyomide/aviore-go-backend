import {
  Controller,
  Get,
  Req,
  UseGuards,
} from '@nestjs/common';

import { RiderDashboardService } from './rider-dashboard.service';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

import { GetUser } from '../auth/decorators/get-user.decorator';


@Controller('rider/dashboard')
@UseGuards(JwtAuthGuard)
export class RiderDashboardController {
  constructor(
    private readonly riderDashboardService: RiderDashboardService,
  ) {}

@Get('overview')
getOverview(@Req() req: any) {
  // Support both req.user.userId and req.user.id or sub from JWT Payload
  const userId = req.user?.userId || req.user?.id || req.user?.sub;
  return this.riderDashboardService.getOverview(userId);
}
}