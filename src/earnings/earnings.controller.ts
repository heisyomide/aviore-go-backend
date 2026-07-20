import {
  Controller,
  Get,
  Req,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RiderEarningsService } from './earnings.service';

@Controller('rider/earnings')
@UseGuards(JwtAuthGuard)
export class RiderEarningsController {
  constructor(
    private readonly earningsService: RiderEarningsService,
  ) {}

  /**
   * Rider Earnings Dashboard
   */
  @Get()
  async getDashboard(
    @Req() req: any,
  ) {
    return this.earningsService.getDashboard(
       req.user.userId,
    );
  }

  /**
   * Earnings History
   */
  @Get('history')
  async getHistory(
    @Req() req: any,
  ) {
    return this.earningsService.getHistory(
       req.user.userId,
    );
  }
}