import { Controller, Get, Query } from '@nestjs/common';
import { PrismaService } from '../providers/database/prisma.service';



@Controller('search')
export class SearchController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async globalSearch(@Query('q') query: string) {
    if (!query || query.trim().length === 0) {
      return { merchants: [], events: [] };
    }

    const searchTerm = query.toLowerCase();

    const [merchants, events] = await Promise.all([
      this.prisma.merchantProfile.findMany({
        where: {
          OR: [
            { businessName: { contains: searchTerm, mode: 'insensitive' } },
            { description: { contains: searchTerm, mode: 'insensitive' } },
            { cuisineType: { contains: searchTerm, mode: 'insensitive' } },
          ],
        },
        take: 5,
      }),
      this.prisma.event.findMany({
        where: {
          OR: [
            { title: { contains: searchTerm, mode: 'insensitive' } },
            { description: { contains: searchTerm, mode: 'insensitive' } },
            { venue: { contains: searchTerm, mode: 'insensitive' } },
          ],
        },
        take: 5,
      }),
    ]);

    return {
      merchants: merchants.map(m => ({
        id: m.id,
        title: m.businessName || 'Store',
        category: m.merchantType,
        href: `/merchants/${m.id}`,
      })),
      events: events.map(e => ({
        id: e.id,
        title: e.title,
        category: 'Event',
        href: `/events/${e.id}`,
      })),
    };
  }
}