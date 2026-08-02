import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JobCommGateway } from '../chat/chat.gateway';
import { ChatService } from '../chat/chat.service';
import { DatabaseModule } from 'src/providers/database/database.module';

@Module({
  imports: [
    DatabaseModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'super-secret-key',
    }),
  ],
  providers: [JobCommGateway, ChatService],
  exports: [JobCommGateway],
})
export class WebSocketModule {}