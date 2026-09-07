import { Module } from '@nestjs/common';
import { FoodOrdersController } from './order.controller';
import { FoodOrdersService } from './order.service';
import { DatabaseModule } from '../providers/database/database.module';
import { PricingModule } from 'src/pricing/pricing.module';

@Module({
  imports: [DatabaseModule, PricingModule],
  controllers: [FoodOrdersController],
  providers: [FoodOrdersService],
  exports: [FoodOrdersService],
})
export class FoodOrdersModule {}