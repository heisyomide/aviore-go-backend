import { Module } from '@nestjs/common';
import { StorefrontController } from '../storefront/storefront.controller';
import { StorefrontService } from '../storefront/storefront.service';
import { DatabaseModule } from '../providers/database/database.module';
import { SearchController } from './search.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [StorefrontController, SearchController],
  providers: [StorefrontService],
})
export class StorefrontModule {}