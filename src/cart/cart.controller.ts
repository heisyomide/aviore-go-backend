import { Controller, Get, Post, Patch, Delete, Body, Param, Req, UseGuards } from '@nestjs/common';
import { CartService } from './cart.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'; // Adjust path to your auth guard

@UseGuards(JwtAuthGuard) // <--- Add this guard here
@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  private resolveUserId(req: any): string {
    return req.user?.id || req.user?.sub || req.user?.userId || req.headers['user-id'] || req.headers['guest-id'] || 'anonymous-guest-user';
  }

  @Get()
  getCart(@Req() req) {
    const userId = this.resolveUserId(req);
    return this.cartService.getCart(userId);
  }

  @Post('items')
  addItem(
    @Req() req, 
    @Body() body: { foodItemId: string; quantity: number },
  ) {
    const userId = this.resolveUserId(req);
    return this.cartService.addItemToCart(userId, body.foodItemId, body.quantity || 1);
  }

  @Patch('items/:cartItemId')
  updateQuantity(
    @Req() req,
    @Param('cartItemId') cartItemId: string,
    @Body() body: { quantity: number },
  ) {
    const userId = this.resolveUserId(req);
    return this.cartService.updateQuantity(userId, cartItemId, body.quantity);
  }

  @Delete('items/:id')
  removeCartItem(
    @Req() req, 
    @Param('id') itemId: string,
  ) {
    const userId = this.resolveUserId(req);
    return this.cartService.removeCartItem(userId, itemId);
  }
}