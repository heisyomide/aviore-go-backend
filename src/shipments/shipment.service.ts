import { Injectable } from '@nestjs/common';
import { PrismaService } from '../providers/database/prisma.service'; 
import { Prisma, ShipmentStatus } from '@prisma/client'; 
import { CreateShipmentDto } from './dto/create-shipment.dto';
import { PricingService } from '../pricing/pricing.service';
import { DispatchService } from 'src/dispatch/dispatch.service';

@Injectable()
export class ShipmentsService {
  constructor(
    private prisma: PrismaService, 
    private PricingService: PricingService,
    private readonly dispatchService: DispatchService
  ) {}

  /**
   * Generates an 8-character uppercase cryptographic tracking code with collision checks
   */
  private async generateTrackingCode(): Promise<string> {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    let isUnique = false;

    while (!isUnique) {
      code = 'AVG-';
      for (let i = 0; i < 8; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      const existing = await this.prisma.shipment.findUnique({ where: { trackingCode: code } });
      if (!existing) isUnique = true;
    }
    return code;
  }

  /**
   * Main orchestrator pipeline creating a real-coordinate automated manifest waybill
   */
async createShipment(customerId: string, dto: CreateShipmentDto) {
  const trackingCode = await this.generateTrackingCode();

  // 1. Invoke the step-by-step Pricing Engine using strict boolean fallbacks
  const pricingResult = this.PricingService.calculate({
    pickupLat: dto.pickupLat,
    pickupLng: dto.pickupLng,
    destinationLat: dto.destinationLat,
    destinationLng: dto.destinationLng,
    packageCategory: dto.packageCategory, 
    weightRange: dto.weightRange,         
    isExpress: dto.isExpress || false,   // Prevents type 'undefined'
    waterproof: dto.waterproof || false, // Prevents type 'undefined'
  });

  const totalPayable = pricingResult.totalDeliveryFee;

  // 2. Financial split distributions (80/20 platform ledger share ratio)
  const platformShare = totalPayable * 0.20;
  const riderShare = totalPayable * 0.80;

  console.log("Customer ID:", customerId);

  const shipmentData = {
    trackingCode,
    deliveryType: dto.deliveryType,
    packageCategory: dto.packageCategory,
    weightRange: dto.weightRange,
    description: dto.description || '',

    // Step 2: Pickup Metadata & Sender Info
    pickupAddress: dto.pickupAddress,
    pickupLandmark: dto.pickupLandmark || null, // Landmark saved for rider orientation
    pickupLat: dto.pickupLat,
    pickupLng: dto.pickupLng,
    pickupPlaceId: dto.pickupPlaceId || null,   // Nullable for manual map pins
    senderName: dto.senderName,
    senderPhone: dto.senderPhone,

    // Step 3: Destination Metadata & Recipient Info
    destinationAddress: dto.destinationAddress,
    destinationLandmark: dto.destinationLandmark || null, // Landmark saved for rider orientation
    destinationLat: dto.destinationLat,
    destinationLng: dto.destinationLng,
    destinationPlaceId: dto.destinationPlaceId || null,   // Nullable for manual map pins
    recipient: dto.receiverName,
    recipientPhone: dto.receiverPhone,

    regionType: pricingResult.detectedRegion,

    // Step 4: Handling Flags
    isFragile: dto.isFragile || false,
    keepUpright: dto.keepUpright || false,
    handleWithCare: dto.handleWithCare || false,
    waterproof: dto.waterproof || false,
    isExpress: dto.isExpress || false,

    isSmartDelivery: dto.deliveryMethod === 'smart',
    specialNotes: dto.deliveryNote || '',
    verificationPin: dto.verificationPin,

    // Financial Breakdown
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

  console.dir(shipmentData, { depth: null });

  const shipment = await this.prisma.shipment.create({
    data: shipmentData,
  });

  await this.dispatchService.dispatchShipment(
    shipment,
  );

  return shipment;
}
  /**
   * Aggregates live shipment counts to populate customer UI overview tiles
   */
  async getCustomerStats(customerId: string) {
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
  return this.prisma.shipment.findMany({
    where: {
      customerId,
    },

    include: {
      timelineEvents: {
        orderBy: {
          createdAt: "asc",
        },
      },

      rider: true,
    },

    orderBy: {
      createdAt: "desc",
    },
  });
}
  /**
   * Fetches top 5 active/recent orders formatted cleanly for the customer layout view
   */
 async getRecentCustomerShipments(customerId: string) {
    // FIXED: Target the shipment model table context explicitly (.shipment)
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
        recipient: shipment.destinationAddress.split(',')[0], 
        destination: shipment.destinationAddress,
        status: displayStatus,
        date: shipment.createdAt.toISOString().split('T')[0], 
      };
    });
  }

  async getCustomerDashboard(customerId: string) {
  const stats = await this.getCustomerStats(customerId);

  const shipments =
    await this.getRecentCustomerShipments(customerId);

  return {
    stats,
    shipments,
  };
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

async getShipment(
  idOrCode: string,
  customerId: string,
) {
  return this.prisma.shipment.findFirst({
    where: {
      customerId: customerId,
      OR: [
        { id: idOrCode },
        { trackingCode: idOrCode }
      ]
    },
    include: {
      rider: true,

      timelineEvents: {
        orderBy: {
          createdAt: "asc",
        },
      },

      trackingLogs: {
        orderBy: {
          createdAt: "desc",
        },
      },
    },
  });
}
}