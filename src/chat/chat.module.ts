import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ChatService } from './chat.service';
import { JobCommunicationGateway } from './job-communication.gateway';
import { PrismaService } from '../providers/database/prisma.service';

@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') || 'your-default-secret',
        signOptions: { expiresIn: '7d' },
      }),
    }),
  ],
  providers: [ChatService, JobCommunicationGateway, PrismaService],
  exports: [ChatService],
})
export class ChatModule {}