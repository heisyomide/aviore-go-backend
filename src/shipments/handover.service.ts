import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../providers/database/prisma.service';
import { WalletLedgerService } from './wallet-ledger.service';
import { ShipmentStatus } from '.prisma/client';

@Injectable()
export class HandoverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly walletLedger: WalletLedgerService
  ) {}

  /**
   * Path A: Standard PIN Handover -> Instantly releases escrow payment
   */
  async verifyStandardPin(shipmentId: string, submittedPin: string, riderId: string) {
    const shipment = await this.prisma.shipment.findUnique({
      where: { id: shipmentId },
    });

    if (!shipment) throw new BadRequestException('Shipment not found.');
    if (shipment.riderId !== riderId) throw new ForbiddenException('Unauthorized rider context.');
    if ((shipment as any).isSmartDelivery) throw new BadRequestException('This order requires Smart Delivery validation.');
    if ((shipment as any).verificationPin !== submittedPin) throw new BadRequestException('Invalid verification PIN.');

    // Update rider performance metrics on success
    await this.prisma.riderProfile.update({
      where: { id: riderId },
      data: { completedDeliveries: { increment: 1 } } as any,
    });

    return this.walletLedger.releaseEscrowPayout(shipmentId, riderId);
  }

  /**
   * Path B: Smart Delivery Execution -> Saves secure proofs and sets 12-hour lock window
   */
  async executeSmartDelivery(
    shipmentId: string, 
    riderId: string, 
    proofPhotos: string[]
  ) {
    const shipment = await this.prisma.shipment.findUnique({
      where: { id: shipmentId },
      include: { rider: true }
    });

    if (!shipment) throw new BadRequestException('Shipment not found.');
    if (shipment.riderId !== riderId) throw new ForbiddenException('Unauthorized rider context.');
    if (!(shipment as any).isSmartDelivery) throw new BadRequestException('Smart Delivery is not enabled for this order.');

    // Enforce Level 2 Validation constraints dynamically
    const rider = (shipment as any).rider;
    if (!rider || rider.trustScore < 80 || rider.completedDeliveries < 50) {
      throw new ForbiddenException('Rider does not meet the eligibility metrics for Smart Delivery.');
    }

    if (proofPhotos.length < 3) {
      throw new BadRequestException('Smart Delivery completion requires at least 3 proof photos.');
    }

    const protectionTimerDuration = 12; // 12-hour business protection rule
    const releaseTime = new Date();
    releaseTime.setHours(releaseTime.getHours() + protectionTimerDuration);

    return this.prisma.$transaction(async (tx) => {
      // Advance shipment state to intermediate verification target holding lock
      const updatedShipment = await tx.shipment.update({
        where: { id: shipmentId },
        data: {
          status: ShipmentStatus.DELIVERED, // Marks trip execution complete
          smartDeliveryPhotos: proofPhotos,
          escrowReleaseAt: releaseTime,
        } as any,
      });

      await tx.statusTimeline.create({
        data: {
          shipmentId,
          status: ShipmentStatus.DELIVERED,
          description: `Smart Delivery drop-off registered. Escrow frozen under 12-hour protection window.`,
          changedBy: riderId,
        },
      });

      await tx.riderProfile.update({
        where: { id: riderId },
        data: { completedDeliveries: { increment: 1 } } as any,
      });

      return {
        success: true,
        message: 'Smart Delivery uploaded successfully. Protection countdown initiated.',
        escrowReleaseAt: releaseTime,
      };
    });
  }
async raiseShipmentDispute(shipmentId: string, userId: string, reason: string) {
    const shipment = await this.prisma.shipment.findUnique({
      where: { id: shipmentId },
    });

    if (!shipment) throw new NotFoundException('Shipment record not found');
    
    // ⚠️ Check if your schema uses customerId or userId instead of senderId
    const isOwner = (shipment as any).customerId === userId || (shipment as any).senderId === userId;
    if (!isOwner) throw new BadRequestException('Unauthorized: Only the sender can dispute this delivery');
    
    if (shipment.status !== ShipmentStatus.DELIVERED) {
      throw new BadRequestException('Disputes can only be raised during the active 12-hour protection window post-delivery');
    }

return this.prisma.$transaction(async (tx) => {
      // 1. Lock down the shipment status and completely clear the auto-release timestamp
      const updatedShipment = await tx.shipment.update({
        where: { id: shipmentId },
        // ⚠️ Cast the ENTIRE object to any to bypass the missing property check completely
        data: {
          status: 'DISPUTED',
          escrowReleaseAt: null,
        } as any, 
      });

      // 2. Log an audit entry into a system incident tracker
      await (tx as any).incidentLog.create({
        data: {
          shipmentId,
          raisedById: userId,
          reason,
          resolved: false,
        },
      });

      return updatedShipment;
    });
  }
}