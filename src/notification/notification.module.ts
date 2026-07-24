import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config'; // 👈 Import ConfigModule
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import { ResendService } from './provider/resend.service';
import { BrevoService } from './provider/brevo.service';
import { PushNotificationService } from './provider/push.service';

@Module({
  imports: [ConfigModule], // 👈 Added here to supply ConfigService
  controllers: [NotificationController],
  providers: [
    NotificationService,
    ResendService,
    BrevoService,
    PushNotificationService,
  ],
  exports: [NotificationService],
})
export class NotificationModule {}