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
import { MerchantWalletService } from './merchant-wallet.service';
import { MerchantWalletController } from './merchant-wallet.controller';

@Module({
  imports: [
    ConfigModule,
    DispatchModule,
    HttpModule,
    NotificationModule,
    PricingModule,
  ],

  controllers: [WalletController, MerchantWalletController],

  providers: [
    WalletService,
    MerchantWalletService,
    FlutterwaveService,
    PrismaService,
  ],

  exports: [WalletService, MerchantWalletService,],
})
export class WalletModule {}