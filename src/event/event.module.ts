import { Module } from '@nestjs/common';
import { EventsService } from './events.service';
import { EventsController } from './events.controller';
import { DatabaseModule } from '../providers/database/database.module'; // Adjust path if your PrismaModule is located elsewhere
import { DashboardService } from './dashboard.service';

@Module({
  imports: [DatabaseModule],
  controllers: [EventsController],
  providers: [EventsService, DashboardService],
  exports: [EventsService, DashboardService],
})
export class EventsModule {}