import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../providers/database/prisma.service';
import { Prisma, ShipmentStatus } from '@prisma/client';
import { CreateShipmentDto } from './dto/create-shipment.dto';
import { PricingService } from '../pricing/pricing.service';
import { DispatchService } from 'src/dispatch/dispatch.service';
import { PaymentsService } from '../payments/payments.service';
import { NavigationService } from './navigation.service'; // 👈 Injected NavigationService

@Injectable()
export class ShipmentsService {
  constructor(
    private prisma: PrismaService,
    private PricingService: PricingService,
    private readonly dispatchService: DispatchService,
    private readonly paymentsService: PaymentsService,
    private readonly navigationService: NavigationService, // 👈 Injected NavigationService
  ) {}

  private async generateTrackingCode(): Promise<string> {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    let isUnique = false;

    while (!isUnique) {
      code = 'AVG-';
      for (let i = 0; i < 8; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      const existing = await this.prisma.shipment.findUnique({
        where: { trackingCode: code },
      });
      if (!existing) isUnique = true;
    }
    return code;
  }

  async createShipment(customerId: string, dto: CreateShipmentDto) {
    if (!customerId) {
      throw new Error('customerId parameter is required');
    }

    const trackingCode = await this.generateTrackingCode();

    const pricingResult = this.PricingService.calculate({
      pickupLat: dto.pickupLat,
      pickupLng: dto.pickupLng,
      destinationLat: dto.destinationLat,
      destinationLng: dto.destinationLng,
      packageCategory: dto.packageCategory,
      weightRange: dto.weightRange,
      isExpress: dto.isExpress || false,
      waterproof: dto.waterproof || false,
    });

    const totalPayable = pricingResult.totalDeliveryFee;
    const platformShare = totalPayable * 0.2;
    const riderShare = totalPayable * 0.8;

    const shipmentData = {
      trackingCode,
      deliveryType: dto.deliveryType,
      packageCategory: dto.packageCategory,
      weightRange: dto.weightRange,
      description: dto.description || '',

      pickupAddress: dto.pickupAddress,
      pickupLandmark: dto.pickupLandmark || null,
      pickupLat: dto.pickupLat,
      pickupLng: dto.pickupLng,
      pickupPlaceId: dto.pickupPlaceId || null,
      senderName: dto.senderName,
      senderPhone: dto.senderPhone,

      destinationAddress: dto.destinationAddress,
      destinationLandmark: dto.destinationLandmark || null,
      destinationLat: dto.destinationLat,
      destinationLng: dto.destinationLng,
      destinationPlaceId: dto.destinationPlaceId || null,
      recipient: dto.receiverName,
      recipientPhone: dto.receiverPhone,

      regionType: pricingResult.detectedRegion,

      isFragile: dto.isFragile || false,
      keepUpright: dto.keepUpright || false,
      handleWithCare: dto.handleWithCare || false,
      waterproof: dto.waterproof || false,
      isExpress: dto.isExpress || false,

      isSmartDelivery: dto.deliveryMethod === 'smart',
      specialNotes: dto.deliveryNote || '',
      verificationPin: dto.verificationPin,

      baseFee: new Prisma.Decimal(pricingResult.breakdown.baseFee),
      pickupDistFee: new Prisma.Decimal(pricingResult.breakdown.pickupDistanceFee),
      deliveryDistFee: new Prisma.Decimal(pricingResult.breakdown.deliveryDistanceFee),
      extraCharges: new Prisma.Decimal(pricingResult.breakdown.extraCharges),
      totalPrice: new Prisma.Decimal(totalPayable),
      riderShare: new Prisma.Decimal(riderShare),
      platformShare: new Prisma.Decimal(platformShare),

      distanceKm: pricingResult.distanceKm,
      estimatedMinutes: pricingResult.estimatedMinutes,

      customer: {
        connect: {
          id: customerId,
        },
      },

      timelineEvents: {
        create: {
          status: ShipmentStatus.PENDING,
          description: `Shipment generated automatically via Pricing Engine. Zone: ${pricingResult.detectedRegion}`,
          changedBy: 'CUSTOMER',
        },
      },
    };

    const shipment = await this.prisma.shipment.create({
      data: shipmentData,
    });

    await this.dispatchService.dispatchShipment(shipment);

    return shipment;
  }

  /**
   * Get Voice Navigation Turn Steps for Rider PWA Map
   */
  async getShipmentNavigationRoute(shipmentId: string) {
    const shipment = await this.prisma.shipment.findUnique({
      where: { id: shipmentId },
    });

    if (!shipment) {
      throw new NotFoundException('Shipment not found.');
    }

    return this.navigationService.getVoiceRoute(
      Number(shipment.pickupLat),
      Number(shipment.pickupLng),
      Number(shipment.destinationLat),
      Number(shipment.destinationLng),
    );
  }

  /**
   * Verify Delivery PIN & Trigger Automatic Escrow Release
   */
  async verifyDeliveryPin(shipmentId: string, inputPin: string, riderUserId: string) {
    const shipment = await this.prisma.shipment.findUnique({
      where: { id: shipmentId },
    });

    if (!shipment) {
      throw new NotFoundException('Shipment not found.');
    }

    if (shipment.status === ShipmentStatus.DELIVERED) {
      throw new BadRequestException('Shipment has already been marked as delivered.');
    }

    // 1. Validate PIN
    if (shipment.verificationPin !== inputPin) {
      throw new BadRequestException('Invalid delivery PIN provided.');
    }

    // 2. Mark shipment as DELIVERED
    const updatedShipment = await this.prisma.shipment.update({
      where: { id: shipmentId },
      data: {
        status: ShipmentStatus.DELIVERED,
        deliveredAt: new Date(),
        timelineEvents: {
          create: {
            status: ShipmentStatus.DELIVERED,
            description: 'Delivery verified via customer PIN.',
            changedBy: 'RIDER',
          },
        },
      },
    });

    // 3. Trigger Escrow Funds Release to Rider Wallet
    const escrowResult = await this.paymentsService.releaseEscrow(
      shipmentId,
      riderUserId,
    );

    return {
      success: true,
      message: 'Delivery PIN verified successfully. Escrow released.',
      shipment: updatedShipment,
      payout: escrowResult,
    };
  }

  async getCustomerStats(customerId: string) {
    if (!customerId) return { active: 0, inTransit: 0, delivered: 0 };

    const statusCounts = await this.prisma.shipment.groupBy({
      by: ['status'],
      where: { customerId },
      _count: { id: true },
    });

    let active = 0;
    let inTransit = 0;
    let delivered = 0;

    statusCounts.forEach((item) => {
      switch (item.status) {
        case ShipmentStatus.PENDING:
        case ShipmentStatus.ACCEPTED:
        case ShipmentStatus.PICKED_UP:
          active += item._count.id;
          break;
        case ShipmentStatus.IN_TRANSIT:
        case ShipmentStatus.ARRIVED_AT_HUB:
        case ShipmentStatus.OUT_FOR_DELIVERY:
          inTransit += item._count.id;
          break;
        case ShipmentStatus.DELIVERED:
          delivered += item._count.id;
          break;
        default:
          break;
      }
    });

    return { active, inTransit, delivered };
  }

  async getCustomerShipments(customerId: string) {
    if (!customerId) return [];

    return this.prisma.shipment.findMany({
      where: { customerId },
      include: {
        timelineEvents: {
          orderBy: { createdAt: 'asc' },
        },
        rider: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getRecentCustomerShipments(customerId: string) {
    if (!customerId) return [];

    const rawShipments = await this.prisma.shipment.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    return rawShipments.map((shipment) => {
      let displayStatus: 'Active' | 'In Transit' | 'Delivered' = 'Active';

      switch (shipment.status) {
        case ShipmentStatus.IN_TRANSIT:
        case ShipmentStatus.ARRIVED_AT_HUB:
        case ShipmentStatus.OUT_FOR_DELIVERY:
          displayStatus = 'In Transit';
          break;
        case ShipmentStatus.DELIVERED:
          displayStatus = 'Delivered';
          break;
        default:
          displayStatus = 'Active';
          break;
      }

      return {
        id: shipment.trackingCode,
        recipient: shipment.recipient || shipment.destinationAddress.split(',')[0],
        destination: shipment.destinationAddress,
        status: displayStatus,
        date: shipment.createdAt.toISOString().split('T')[0],
      };
    });
  }

  async getCustomerDashboard(customerId: string) {
    const stats = await this.getCustomerStats(customerId);
    const shipments = await this.getRecentCustomerShipments(customerId);

    return { stats, shipments };
  }

  async updateLiveLocation(shipmentId: string, latitude: number, longitude: number) {
    return this.prisma.shipment.update({
      where: { id: shipmentId },
      data: {
        riderLastLat: String(latitude),
        riderLastLng: String(longitude),
      },
    });
  }

  async getShipment(idOrCode: string, customerId: string) {
    const shipment = await this.prisma.shipment.findFirst({
      where: {
        customerId,
        OR: [{ id: idOrCode }, { trackingCode: idOrCode }],
      },
      include: {
        rider: true,
        timelineEvents: {
          orderBy: { createdAt: 'asc' },
        },
        trackingLogs: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!shipment) {
      throw new NotFoundException(`Shipment with ID or tracking code ${idOrCode} not found`);
    }

    return shipment;
  }
}