import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';

import { PrismaService } from '../providers/database/prisma.service';

import { FlutterwaveController } from './flutterwave.controller';
import { FlutterwaveService } from './flutterwave.service';
import { WalletService } from 'src/wallet/wallet.service';
import { WalletController } from 'src/wallet/wallet.controller';
import { NotificationModule } from 'src/notification/notification.module';

@Module({
  imports: [
    ConfigModule,
    NotificationModule,
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 5,
    }),
  ],
  controllers: [FlutterwaveController, WalletController],
  providers: [
    FlutterwaveService,
    PrismaService,
    WalletService,
  ],
  exports: [FlutterwaveService,WalletService],
})
export class FlutterwaveModule {}