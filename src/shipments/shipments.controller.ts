import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ShipmentsService } from '../shipments/shipment.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'; 
import { GetUser } from '.././auth/decorators/get-user.decorator';
import { CreateShipmentDto } from './dto/create-shipment.dto';

@Controller('shipments')
@UseGuards(JwtAuthGuard)
export class ShipmentsController {
  constructor(private readonly shipmentsService: ShipmentsService) {}

  @Get('dashboard-stats')
  async getDashboardStats(@GetUser() user: any) {
    // Standardizes ID reading from JWT .sub claim
    return this.shipmentsService.getCustomerStats(user.userId);
  }

@Post()
@HttpCode(HttpStatus.CREATED)
async create(
  @Body() dto: CreateShipmentDto,
  @GetUser() user: any,
) {
  const customerId = user.userId;

  const shipment =
    await this.shipmentsService.createShipment(
      customerId,
      dto,
    );

  return {
    success: true,
    message: "Shipment created successfully",
    data: shipment,
  };
}
  @Get('recent')
  async getRecentShipments(@GetUser() user: any) {
    return this.shipmentsService.getRecentCustomerShipments(user.userId);
  }

  @Get("customer/dashboard")
async getCustomerDashboard(@GetUser() user: any) {
  return this.shipmentsService.getCustomerDashboard(user.userId);
}

  @Get()

getCustomerShipments(@Req() req) {

  return this.shipmentsService.getCustomerShipments(req.user.userId);

}


@Get(":idOrCode")
async getShipment(
  @Param("idOrCode") idOrCode: string, // 1. Match the parameter variable name here
  @GetUser() user: any,
) {
  // 2. Ensure your user context payload reads the correct property layout (userId or id)
  const customerId = user.userId || user.id; 

  return this.shipmentsService.getShipment(
    idOrCode,
    customerId,
  );
}
}