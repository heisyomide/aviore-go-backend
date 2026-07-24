import { Module } from '@nestjs/common';

import { RiderJobsController } from './job.controller';
import { RiderJobsService } from './job.service';
import { RealtimeModule } from 'src/realtime/realtime.module';
import { DispatchModule } from 'src/dispatch/dispatch.module';
import { NotificationModule } from 'src/notification/notification.module';

@Module({
  imports: [
RealtimeModule,
NotificationModule,
DispatchModule,

  ],
  controllers: [RiderJobsController],
  providers: [RiderJobsService],
})
export class RiderJobsModule {}