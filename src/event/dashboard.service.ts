import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../providers/database/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getOrganizerMetrics(userId: string) {
    const organizerProfile = await this.prisma.eventOrganizerProfile.findUnique({
      where: { userId },
    });

    if (!organizerProfile) {
      throw new NotFoundException('Organizer profile not found for this user');
    }

    const organizerId = organizerProfile.id;

    // 1. Core Stat Metrics
    const totalBookings = await this.prisma.eventBooking.count({
      where: { event: { organizerId } },
    });

    const boarded = await this.prisma.eventBooking.count({
      where: { 
        event: { organizerId },
        boardingStatus: 'BOARDED',
      },
    });

    const onTransit = await this.prisma.eventTrip.count({
      where: { 
        route: { event: { organizerId } },
        status: 'IN_TRANSIT',
      },
    });

    const completed = await this.prisma.eventBooking.count({
      where: { 
        event: { organizerId },
        boardingStatus: 'COMPLETED',
      },
    });

    const revenue = await this.prisma.eventPayment.aggregate({
      where: { 
        booking: { event: { organizerId } },
        status: 'SUCCESS',
      },
      _sum: { amount: true },
    });

    const successfulPaymentsCount = await this.prisma.eventPayment.count({
      where: {
        booking: { event: { organizerId } },
        status: 'SUCCESS',
      }
    });

    const refundsCount = await this.prisma.eventPayment.count({
      where: {
        booking: { event: { organizerId } },
        status: 'REFUNDED',
      }
    });

    // 2. Live Trips Telemetry (For Live Map & Table)
    const liveTrips = await this.prisma.eventTrip.findMany({
      where: { 
        route: { event: { organizerId } },
        status: { not: 'COMPLETED' },
      },
      include: { 
        route: true,
        vehicle: true,
        bookings: true,
      },
    });

    // 3. Recent Bookings (Last 5)
    const recentBookingsRaw = await this.prisma.eventBooking.findMany({
      where: { event: { organizerId } },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: {
        customer: true,
        trip: {
          include: { vehicle: true }
        }
      }
    });

    const recentBookings = recentBookingsRaw.map(b => {
      const vehicleInfo = b.trip?.vehicle;
      const busName = vehicleInfo ? `${vehicleInfo.make} ${vehicleInfo.model}` : 'Assigned Bus';
      return {
        id: b.id,
        name: b.customer ? `${b.customer.firstName || ''} ${b.customer.lastName || ''}`.trim() || b.customer.email : 'Passenger',
        bus: busName,
        status: b.boardingStatus,
      };
    });

    // 4. Top Pickup Points (Grouped dynamically via pickupPoint relation)
    const bookingsWithPickup = await this.prisma.eventBooking.findMany({
      where: { event: { organizerId } },
      include: {
        pickupPoint: true,
      },
    });

    const pickupCounts: Record<string, number> = {};
    bookingsWithPickup.forEach(b => {
      // @ts-ignore - Fallback check if pickupPoint relation exists in schema
      const loc = b.pickupPoint?.name || b.pickupPoint?.locationName || 'Main Terminal';
      pickupCounts[loc] = (pickupCounts[loc] || 0) + 1;
    });

    const topPickupPoints = Object.entries(pickupCounts)
      .map(([name, count]) => ({ name, count: `${count} Passenger${count > 1 ? 's' : ''}` }))
      .sort((a, b) => parseInt(b.count) - parseInt(a.count));

    return {
      stats: {
        totalBookings,
        boarded,
        onTransit,
        completed,
        totalRevenue: revenue._sum.amount || 0,
        successfulPayments: successfulPaymentsCount,
        refunds: refundsCount,
      },
      liveTrips,
      recentBookings,
      topPickupPoints,
    };
  }
}