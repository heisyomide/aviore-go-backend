import { Module } from '@nestjs/common';
import { StorefrontController } from '../storefront/storefront.controller';
import { StorefrontService } from '../storefront/storefront.service';
import { DatabaseModule } from '../providers/database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [StorefrontController],
  providers: [StorefrontService],
})
export class StorefrontModule {}