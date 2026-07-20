import { Module } from '@nestjs/common';

import { DispatchService } from './dispatch.service';
import { DispatchController } from './dispatch.controller';

import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [
    RealtimeModule,
  ],
  controllers: [
    DispatchController,
  ],
  providers: [
    DispatchService,
  ],
  exports: [
    DispatchService,
  ],
})
export class DispatchModule {}