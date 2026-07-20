import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { RealtimeGateway } from './realtime.gateway';
import { RealtimeService } from './realtime.service';
import { SocketAuthService } from './socket-auth.service';

@Module({
  imports: [
    JwtModule,
  ],
  providers: [
    RealtimeGateway,
    RealtimeService,
    SocketAuthService,
  ],
  exports: [
    RealtimeService,
  ],
})
export class RealtimeModule {}