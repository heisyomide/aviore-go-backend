// src/organizer/organizer.module.ts
import { Module } from '@nestjs/common';
import { OrganizerController } from './organizer.controller';
import { OrganizerService } from './organizer.service';
import { DatabaseModule } from '../providers/database/database.module'; // Adjust path to your PrismaModule
import { NotificationModule } from '../notification/notification.module'; // Adjust path to your NotificationModule

@Module({
  imports: [DatabaseModule, NotificationModule],
  controllers: [OrganizerController],
  providers: [OrganizerService],
  exports: [OrganizerService],
})
export class OrganizerModule {}