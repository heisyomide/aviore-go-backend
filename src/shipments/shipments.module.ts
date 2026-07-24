import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios'; // 👈 Added HttpModule for NavigationService API calls
import { ShipmentsController } from './shipments.controller';
import { ShipmentsService } from './shipment.service';
import { NavigationService } from './navigation.service'; // 👈 Added NavigationService
import { PricingService } from '../pricing/pricing.service';
import { WalletLedgerService } from './wallet-ledger.service';
import { ShipmentsGateway } from './shipments.gateway';
import { EscrowCronService } from './escrow-cron.service';
import { HandoverService } from './handover.service';
import { PricingModule } from 'src/pricing/pricing.module';
import { DispatchModule } from 'src/dispatch/dispatch.module';
import { PaymentsModule } from 'src/payments/payments.module';

@Module({
  imports: [
    HttpModule, // 👈 Required for NavigationService HttpService calls
    PricingModule, 
    PaymentsModule, 
    DispatchModule
  ],
  controllers: [ShipmentsController],
  providers: [
    ShipmentsService,
    NavigationService, // 👈 Registered NavigationService Provider
    PricingService, 
    WalletLedgerService, 
    ShipmentsGateway, 
    EscrowCronService, 
    HandoverService,
  ],
  exports: [
    ShipmentsService,
    NavigationService, // 👈 Exported so other modules can use it if needed
    PricingService, 
    WalletLedgerService, 
    HandoverService,
  ],
})
export class ShipmentsModule {}