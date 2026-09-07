import { Controller, Get, Post, Patch, Delete, Body, Param, Req, Query } from '@nestjs/common';
import { CartService } from './cart.service';

@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  private resolveUserId(req: any): string {
    return req.user?.id || req.headers['guest-id'] || 'anonymous-guest-user';
  }

  @Get()
  getCart(@Req() req, @Query('lat') lat?: string, @Query('lng') lng?: string) {
    const userId = this.resolveUserId(req);
    const parsedLat = lat != null ? parseFloat(lat) : undefined;
    const parsedLng = lng != null ? parseFloat(lng) : undefined;
    return this.cartService.getCart(userId, parsedLat, parsedLng);
  }

  @Post('items')
  addItem(
    @Req() req, 
    @Body() body: { foodItemId: string; quantity: number },
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
  ) {
    const userId = this.resolveUserId(req);
    const parsedLat = lat != null ? parseFloat(lat) : undefined;
    const parsedLng = lng != null ? parseFloat(lng) : undefined;
    return this.cartService.addItemToCart(userId, body.foodItemId, body.quantity || 1, parsedLat, parsedLng);
  }

  @Patch('items/:cartItemId')
  updateQuantity(
    @Req() req,
    @Param('cartItemId') cartItemId: string,
    @Body() body: { quantity: number },
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
  ) {
    const userId = this.resolveUserId(req);
    const parsedLat = lat != null ? parseFloat(lat) : undefined;
    const parsedLng = lng != null ? parseFloat(lng) : undefined;
    return this.cartService.updateQuantity(userId, cartItemId, body.quantity, parsedLat, parsedLng);
  }

  @Delete('items/:id')
  removeCartItem(
    @Req() req, 
    @Param('id') itemId: string,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
  ) {
    const userId = this.resolveUserId(req);
    const parsedLat = lat != null ? parseFloat(lat) : undefined;
    const parsedLng = lng != null ? parseFloat(lng) : undefined;
    return this.cartService.removeCartItem(userId, itemId, parsedLat, parsedLng);
  }
}