import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { CartService } from './cart.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  private resolveUserId(req: any): string {
    return req.user?.id || req.user?.sub || req.user?.userId || req.headers['user-id'] || req.headers['guest-id'] || 'anonymous-guest-user';
  }

  @Get()
  getCart(
    @Req() req,
    @Query('merchantId') merchantId: string,
  ) {
    if (!merchantId) {
      throw new BadRequestException('merchantId query parameter is required');
    }
    const userId = this.resolveUserId(req);
    return this.cartService.getCart(userId, merchantId);
  }

  @Post('items')
  addItem(
    @Req() req, 
    @Body() body: { merchantId: string; foodItemId: string; quantity: number },
  ) {
    if (!body.merchantId) {
      throw new BadRequestException('merchantId is required in request body');
    }
    const userId = this.resolveUserId(req);
    return this.cartService.addItemToCart(userId, body.merchantId, body.foodItemId, body.quantity || 1);
  }

  @Patch('items/:cartItemId')
  updateQuantity(
    @Req() req,
    @Query('merchantId') merchantId: string,
    @Param('cartItemId') cartItemId: string,
    @Body() body: { quantity: number },
  ) {
    if (!merchantId) {
      throw new BadRequestException('merchantId query parameter is required');
    }
    const userId = this.resolveUserId(req);
    return this.cartService.updateQuantity(userId, merchantId, cartItemId, body.quantity);
  }

  @Delete('items/:id')
  removeCartItem(
    @Req() req, 
    @Query('merchantId') merchantId: string,
    @Param('id') itemId: string,
  ) {
    if (!merchantId) {
      throw new BadRequestException('merchantId query parameter is required');
    }
    const userId = this.resolveUserId(req);
    return this.cartService.removeCartItem(userId, merchantId, itemId);
  }
}