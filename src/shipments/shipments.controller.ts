import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import { ShipmentsService } from './shipment.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { CreateShipmentDto } from './dto/create-shipment.dto';

@Controller('shipments')
@UseGuards(JwtAuthGuard)
export class ShipmentsController {
  constructor(private readonly shipmentsService: ShipmentsService) {}

  private extractUserId(user: any): string {
    const userId = user?.userId || user?.id || user?.sub;
    if (!userId) {
      throw new UnauthorizedException('User identifier missing from auth session');
    }
    return userId;
  }

  @Get('dashboard-stats')
  async getDashboardStats(@GetUser() user: any) {
    const customerId = this.extractUserId(user);
    return this.shipmentsService.getCustomerStats(customerId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateShipmentDto, @GetUser() user: any) {
    const customerId = this.extractUserId(user);
    const shipment = await this.shipmentsService.createShipment(customerId, dto);

    return {
      success: true,
      message: 'Shipment created successfully',
      data: shipment,
    };
  }

  @Get('recent')
  async getRecentShipments(@GetUser() user: any) {
    const customerId = this.extractUserId(user);
    return this.shipmentsService.getRecentCustomerShipments(customerId);
  }

  @Get('customer/dashboard')
  async getCustomerDashboard(@GetUser() user: any) {
    const customerId = this.extractUserId(user);
    return this.shipmentsService.getCustomerDashboard(customerId);
  }

  @Get()
  getCustomerShipments(@Req() req) {
    const customerId = this.extractUserId(req.user);
    return this.shipmentsService.getCustomerShipments(customerId);
  }

  @Get(':idOrCode')
  async getShipment(@Param('idOrCode') idOrCode: string, @GetUser() user: any) {
    const customerId = this.extractUserId(user);
    return this.shipmentsService.getShipment(idOrCode, customerId);
  }
}