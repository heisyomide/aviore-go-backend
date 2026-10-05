import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule'; // 👈 1. Import ScheduleModule
import { EngagementService } from './engagement.service';
import { EngagementController } from './engagement.controller';
import { DatabaseModule } from '../providers/database/database.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [
    ScheduleModule.forRoot(), // 👈 2. Required for @Cron() decorators to execute
    DatabaseModule, 
    NotificationModule
  ],
  controllers: [EngagementController],
  providers: [EngagementService],
  exports: [EngagementService], // Optional: good practice if other modules need to call it
})
export class EngagementModule {}