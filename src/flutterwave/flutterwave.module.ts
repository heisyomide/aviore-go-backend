import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';

import { PrismaService } from '../providers/database/prisma.service';

import { FlutterwaveController } from './flutterwave.controller';
import { FlutterwaveService } from './flutterwave.service';
import { WalletService } from 'src/wallet/wallet.service';
import { WalletController } from 'src/wallet/wallet.controller';
import { NotificationModule } from 'src/notification/notification.module';
import { DispatchModule } from 'src/dispatch/dispatch.module'; // 👈 1. Import DispatchModule

@Module({
  imports: [
    ConfigModule,
    NotificationModule,
    DispatchModule, // 👈 2. Add DispatchModule to imports array
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
  exports: [FlutterwaveService, WalletService],
})
export class FlutterwaveModule {}