import { Module } from '@nestjs/common';
import { EventsService } from './events.service';
import { EventsController } from './events.controller';
import { EventRiderJobsService } from './EventRiderJobsService'; // Adjust path if it's in a subfolder or different path
import { DatabaseModule } from '../providers/database/database.module'; 
import { DashboardService } from './dashboard.service';

@Module({
  imports: [DatabaseModule],
  controllers: [EventsController],
  providers: [
    EventsService, 
    DashboardService, 
    EventRiderJobsService // 👈 Added here so NestJS can inject it into the controller
  ],
  exports: [
    EventsService, 
    DashboardService, 
    EventRiderJobsService // 👈 Exported in case other modules require it
  ],
})
export class EventsModule {}