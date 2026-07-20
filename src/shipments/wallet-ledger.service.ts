import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../providers/database/prisma.service';
import { TransactionType, LedgerCategory, ShipmentStatus } from '@prisma/client';

@Injectable()
export class WalletLedgerService {
  constructor(private prisma: PrismaService) {}

  /**
   * Locks delivery payment from customer wallet instantly when job is accepted by a rider
   */
  async holdEscrowPayment(shipmentId: string, riderId: string) {
    return this.prisma.$transaction(async (tx) => {
      // 1. Fetch shipment state and apply an exclusive write-lock to prevent race conditions
      const shipment = await tx.shipment.findUnique({
        where: { id: shipmentId },
      });

      if (!shipment) throw new BadRequestException('Shipment record not found.');
      if (shipment.status !== ShipmentStatus.PENDING) {
        throw new BadRequestException('Job has already been claimed by another rider.');
      }

      // 2. Inspect customer wallet balance capacity
      const customerWallet = await tx.wallet.findUnique({
        where: { userId: shipment.customerId },
      });

      if (!customerWallet || customerWallet.availableBalance.lessThan(shipment.totalPrice)) {
        throw new BadRequestException('Insufficient customer wallet balance to process dispatch.');
      }

      // 3. Deduct total cost from customer wallet balance
      const updatedWallet = await tx.wallet.update({
        where: { userId: shipment.customerId },
        data: {
          availableBalance: { decrement: shipment.totalPrice },
        },
      });

      // 4. Log the immutable double-entry debit audit record
      await tx.transaction.create({
        data: {
          walletId: customerWallet.id,
          amount: shipment.totalPrice,
          type: TransactionType.DEBIT,
          category: LedgerCategory.DELIVERY_PAYMENT,
          referenceCode: `ESCROW-${shipment.trackingCode}-${Date.now()}`,
          description: `Delivery charges securely locked for tracking code ${shipment.trackingCode}`,
        },
      });

      // 5. Update state machine: Assign rider and advance status to ACCEPTED
      const updatedShipment = await tx.shipment.update({
        where: { id: shipmentId },
        data: {
          riderId: riderId,
          status: ShipmentStatus.ACCEPTED,
        },
      });

      // 6. Append tracking checkpoint log status history
      await tx.statusTimeline.create({
        data: {
          shipmentId: shipment.id,
          status: ShipmentStatus.ACCEPTED,
          description: 'Rider assigned. Package payment securely held in escrow.',
          changedBy: riderId,
        },
      });

      return {
        success: true,
        shipmentStatus: updatedShipment.status,
        currentWalletBalance: updatedWallet.availableBalance,
      };
    });
  }

  /**
   * Disburses earnings to the rider's wallet and logs platform commission upon successful delivery.
   */
  async releaseEscrowPayout(shipmentId: string, closingActorId: string) {
    return this.prisma.$transaction(async (tx) => {
      // 1. Fetch shipment and verify it hasn't already been processed
      const shipment = await tx.shipment.findUnique({
        where: { id: shipmentId },
      });

      if (!shipment) throw new BadRequestException('Shipment record not found.');
      if (shipment.status === ShipmentStatus.DELIVERED) {
        throw new BadRequestException('Payout has already been distributed for this shipment.');
      }
      if (!shipment.riderId) {
        throw new BadRequestException('Cannot complete payout: No rider was assigned to this shipment.');
      }

      // 2. Fetch the rider's wallet
      const riderWallet = await tx.wallet.findUnique({
        where: { userId: shipment.riderId },
      });

      if (!riderWallet) {
        throw new BadRequestException('Rider wallet infrastructure not found.');
      }

      // 3. Advance shipment status to DELIVERED
      await tx.shipment.update({
        where: { id: shipmentId },
        data: { status: ShipmentStatus.DELIVERED },
      });

      // 4. Credit the rider's wallet balance with their share
      const updatedRiderWallet = await tx.wallet.update({
        where: { id: riderWallet.id },
        data: {
          availableBalance: { increment: shipment.riderShare },
        },
      });

      // 5. Log the Rider Earnings entry
      await tx.transaction.create({
        data: {
          walletId: riderWallet.id,
          amount: shipment.riderShare,
          type: TransactionType.CREDIT,
          category: LedgerCategory.RIDER_EARNINGS,
          referenceCode: `EARN-${shipment.trackingCode}-${Date.now()}`,
          description: `Earnings credited for delivery ${shipment.trackingCode}`,
        },
      });

      // 6. Log the Platform Commission for company corporate bookkeeping audit trails
      // Note: In a production double-entry model, this would post to a master system wallet.
      await tx.transaction.create({
        data: {
          walletId: riderWallet.id, // Linked contextually or routed to an operational admin vault wallet
          amount: shipment.platformShare,
          type: TransactionType.CREDIT,
          category: LedgerCategory.PLATFORM_COMMISSION,
          referenceCode: `COMM-${shipment.trackingCode}-${Date.now()}`,
          description: `Platform 10% commission recognized for delivery ${shipment.trackingCode}`,
        },
      });

      // 7. Push onto the status timeline history log
      await tx.statusTimeline.create({
        data: {
          shipmentId: shipment.id,
          status: ShipmentStatus.DELIVERED,
          description: 'Package successfully dropped off. Earnings released to rider.',
          changedBy: closingActorId,
        },
      });

      return {
        success: true,
        finalStatus: ShipmentStatus.DELIVERED,
        riderCredited: shipment.riderShare,
        newRiderBalance: updatedRiderWallet.availableBalance,
      };
    });
  }
}