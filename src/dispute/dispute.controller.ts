import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  ForbiddenException,
} from '@nestjs/common';
import { DisputeService } from './dispute.service';
import { CreateDisputeDto } from './dto/create-dispute.dto';
import { ResolveDisputeDto } from './dto/resolve-dispute.dto';
import { DisputeStatus, UserRole } from '@prisma/client';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('disputes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DisputeController {
  constructor(private readonly disputeService: DisputeService) {}

  // 1. POST /disputes - Allowed for Customer, Rider, and Merchant
  @Post()
  @Roles(UserRole.CUSTOMER, UserRole.RIDER, UserRole.MERCHANT)
  async createDispute(@Request() req: any, @Body() dto: CreateDisputeDto) {
    const userId = req.user.id;
    return this.disputeService.createDispute(userId, dto);
  }

  // 2a. GET /disputes/my-disputes - Allowed for Customer, Rider, and Merchant
  @Get('my-disputes')
  @Roles(UserRole.CUSTOMER, UserRole.RIDER, UserRole.MERCHANT)
  async findMyDisputes(@Request() req: any) {
    const userId = req.user.id;
    return this.disputeService.findMyDisputes(userId);
  }

  // 2b. GET /disputes - Global list for Admins only
  @Get()
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async findAll(
    @Query('status') status?: DisputeStatus,
    @Query('jobId') jobId?: string,
  ) {
    return this.disputeService.findAll(status, jobId);
  }

  // 3. GET /disputes/:id - Admin, Customer, Rider, or Merchant can view their respective dispute
  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.CUSTOMER, UserRole.RIDER, UserRole.MERCHANT)
  async findOne(@Param('id') id: string, @Request() req: any) {
    const user = req.user;
    const dispute = await this.disputeService.findOne(id);

    const isAdmin = user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN;
    if (!isAdmin && dispute.reporterId !== user.id) {
      throw new ForbiddenException('You do not have permission to view this dispute.');
    }

    return dispute;
  }

  // 4. PATCH /disputes/:id/status - Admin only
  @Patch(':id/status')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async updateStatus(
    @Param('id') id: string,
    @Request() req: any,
    @Body('status') status: DisputeStatus,
  ) {
    const adminId = req.user.id;
    return this.disputeService.updateStatus(id, adminId, status);
  }

  // 5. PATCH /disputes/:id/resolve - Admin only
  @Patch(':id/resolve')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async resolveDispute(
    @Param('id') id: string,
    @Request() req: any,
    @Body() dto: ResolveDisputeDto,
  ) {
    const adminId = req.user.id;
    return this.disputeService.resolveDispute(id, adminId, dto);
  }
}