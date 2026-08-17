import {
  Body,
  Controller,
  Get,
  Param,
  Req,
  UseGuards,
  Post,
  Patch,
} from '@nestjs/common';

import { RiderJobsService } from './job.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AcceptJobDto } from './interfaces/accept-job.dto';
import { CompleteDeliveryDto } from './dto/complete-delivery.dto';

@Controller('rider/jobs')
@UseGuards(JwtAuthGuard)
export class RiderJobsController {
  constructor(private readonly riderJobsService: RiderJobsService) {}

  /**
   * GET /rider/jobs/available
   */
  @Get('available')
  async getAvailableJobs(@Req() req: any) {
    const userId = req.user.id || req.user.sub;
    return this.riderJobsService.getAvailableJobs(userId);
  }

  /**
   * GET /rider/jobs/events
   * 👈 MUST BE PLACED ABOVE @Get(':shipmentId') SO NESTJS MATCHES IT FIRST!
   */
  @Get('events')
  async getEventTransitJobs(@Req() req: any) {
    console.log('--------------------------------------------------');
    console.log('[RiderJobsController] 📥 GET /rider/jobs/events endpoint hit');
    const userId = req.user.id || req.user.sub || req.user.userId;
    return this.riderJobsService.getEventTransitJobsForDriver(userId);
  }

  /**
   * GET /rider/jobs/:shipmentId
   */
  @Get(':shipmentId')
  getJobDetails(
    @Param('shipmentId')
    shipmentId: string,

    @Req() req: any,
  ) {
    const riderUserId = req.user.userId || req.user.id || req.user.sub;

    return this.riderJobsService.getJobDetails(
      shipmentId,
      riderUserId,
    );
  }

  @Post(':shipmentId/accept')
  acceptJob(
    @Param('shipmentId')
    shipmentId: string,

    @Req()
    req: any,

    @Body()
    dto: AcceptJobDto,
  ) {
    return this.riderJobsService.acceptJob(
      shipmentId,
      req.user.userId || req.user.id || req.user.sub,
    );
  }

  @Patch(':shipmentId/arrive-pickup')
  arrivePickup(
    @Param('shipmentId') shipmentId: string,
    @Req() req: any,
  ) {
    return this.riderJobsService.arrivePickup(
      shipmentId,
      req.user.userId || req.user.id || req.user.sub,
    );
  }

  @Patch(':shipmentId/pickup')
  pickupPackage(
    @Param('shipmentId') shipmentId: string,
    @Req() req: any,
  ) {
    return this.riderJobsService.pickupPackage(
      shipmentId,
      req.user.userId || req.user.id || req.user.sub,
    );
  }

  @Patch(':shipmentId/arrive-destination')
  arriveDestination(
    @Param('shipmentId') shipmentId: string,
    @Req() req: any,
  ) {
    return this.riderJobsService.arriveDestination(
      shipmentId,
      req.user.userId || req.user.id || req.user.sub,
    );
  }

  @Post(':shipmentId/complete')
  completeDelivery(
    @Param('shipmentId')
    shipmentId: string,

    @Req()
    req: any,

    @Body()
    dto: CompleteDeliveryDto,
  ) {
    return this.riderJobsService.completeDelivery(
      shipmentId,
      req.user.userId || req.user.id || req.user.sub,
      dto,
    );
  }
}