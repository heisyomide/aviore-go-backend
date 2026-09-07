import { Module } from '@nestjs/common';

import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';

import { PrismaService } from '../providers/database/prisma.service';
import { FlutterwaveService } from '../flutterwave/flutterwave.service';

import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { NotificationModule } from 'src/notification/notification.module';
import { DispatchModule } from 'src/dispatch/dispatch.module';
import { PricingModule } from 'src/pricing/pricing.module';

@Module({
  imports: [
    ConfigModule,
    DispatchModule,
    HttpModule,
    NotificationModule,
    PricingModule,
  ],

  controllers: [WalletController],

  providers: [
    WalletService,
    FlutterwaveService,
    PrismaService,
  ],

  exports: [WalletService],
})
export class WalletModule {}