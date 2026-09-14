import { Controller, Get, Param, UseGuards, Request, Req } from '@nestjs/common';
import { FoodOrdersService } from './order.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('food-orders')
export class FoodOrdersController {
  constructor(private readonly foodOrdersService: FoodOrdersService) {}

  /**
   * GET /food-orders - List all customer food orders
   */
  @Get()
  async getCustomerOrders(@Request() req: any) {
    const userId = req.user.id;
    return this.foodOrdersService.getCustomerOrders(userId);
  }

  @Get('active')
  async getActiveOrder(@Req() req: any) {
    // Adapt user ID property lookup depending on your JWT payload structure (id | userId | sub)
    const userId = req.user?.id || req.user?.userId || req.user?.sub;
    return this.foodOrdersService.getActiveCustomerOrder(userId);
  }


  /**
   * GET /food-orders/:id - Get live tracking and details for a specific food order
   */
  @Get(':id')
  async getCustomerOrderById(@Param('id') id: string, @Request() req: any) {
    const userId = req.user.id;
    return this.foodOrdersService.getCustomerOrderById(id, userId);
  }
}