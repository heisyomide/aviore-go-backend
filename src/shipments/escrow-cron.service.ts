import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../providers/database/prisma.service';
import { WalletLedgerService } from './wallet-ledger.service';
import { ShipmentStatus } from '@prisma/client';

@Injectable()
export class EscrowCronService {
  private readonly logger = new Logger(EscrowCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly walletLedger: WalletLedgerService
  ) {}

  /**
   * Automatically executes every hour to sweep and clear expired protection windows
   */
  @Cron(CronExpression.EVERY_HOUR)
  async handleExpiredSmartDeliveries() {
    this.logger.log('Initiating cron sweep for expired Smart Delivery protection windows...');

    const now = new Date();

    // 1. Find all delivered smart shipments where the 12-hour timer has expired
    const expiredShipments = await this.prisma.shipment.findMany({
      where: {
        status: ShipmentStatus.DELIVERED,
        isSmartDelivery: true,
        escrowReleaseAt: {
          lte: now,
        },
      } as any, // ⚠️ Bypassing temporary client compilation lock
      select: {
        id: true,
        trackingCode: true,
        riderId: true,
      },
    });

    if (expiredShipments.length === 0) {
      this.logger.log('Sweep complete: No expired protection escrows detected.');
      return;
    }

    this.logger.log(`Found ${expiredShipments.length} shipments ready for payout release. Processing...`);

    // 2. Safely cycle through each transaction and release the held funds
    for (const shipment of expiredShipments) {
      try {
        if (!shipment.riderId) {
          this.logger.warn(`[SKIP] Shipment ${shipment.trackingCode} has no rider allocated.`);
          continue;
        }
        
        // 🟢 Pass shipment.riderId so the funds settle to the actual rider's profile account
        await this.walletLedger.releaseEscrowPayout(shipment.id, shipment.riderId);
        
        this.logger.log(`[SUCCESS] Escrow automatically released via cron daemon for shipment: ${shipment.trackingCode}`);
      } catch (error) {
        this.logger.error(
          `[ERROR] Failed to automatically clear escrow for shipment ID ${shipment.id}`, 
          error instanceof Error ? error.stack : String(error)
        );
      }
    }
  }
}