import { Module } from '@nestjs/common';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';
import { DatabaseModule } from '../providers/database/database.module';
import { PricingModule } from '../pricing/pricing.module';

@Module({
  imports: [DatabaseModule, PricingModule], // <--- Add PricingModule here
  controllers: [CartController],
  providers: [CartService],
  exports: [CartService],
})
export class CartModule {}