import { Module } from '@nestjs/common';
import { ShipmentsController } from './shipments.controller';
import { ShipmentsService } from './shipment.service'; // Ensure this is imported
import { PricingService } from '../pricing/pricing.service';
import { WalletLedgerService } from './wallet-ledger.service';
import { ShipmentsGateway } from './shipments.gateway';
import { EscrowCronService } from './escrow-cron.service';
import { HandoverService } from './handover.service';
import { PricingModule } from 'src/pricing/pricing.module';
import { DispatchModule } from 'src/dispatch/dispatch.module';

@Module({
  imports: [PricingModule, DispatchModule],
  controllers: [ShipmentsController],
  providers: [
    ShipmentsService,      // <--- ADD THIS
    PricingService, 
    WalletLedgerService, 
    ShipmentsGateway, 
    EscrowCronService, 
    HandoverService
  ],
  exports: [
    ShipmentsService,      // <--- Add to exports if other modules need it
    PricingService, 
    WalletLedgerService, 
    HandoverService
  ],
})
export class ShipmentsModule {}