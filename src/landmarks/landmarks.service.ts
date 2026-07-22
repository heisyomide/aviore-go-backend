import { Injectable, OnModuleInit, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../providers/database/prisma.service';
import { CreateLandmarkDto } from './dto/create-landmarks.dto';

export interface LandmarkResponse {
  id: string;
  name: string;
  aliases: string[];
  description: string | null;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
}

@Injectable()
export class LandmarksService implements OnModuleInit {
  private readonly logger = new Logger(LandmarksService.name);

  // In-memory cache grouped by lowercase city name (e.g. "osogbo" -> Landmark[])
  private cache = new Map<string, LandmarkResponse[]>();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Non-blocking init: trigger cache loading in background without blocking server boot.
   * This prevents Prisma cold-start timeouts from preventing the server from starting up.
   */
  onModuleInit() {
    this.refreshCache().catch((err) => {
      this.logger.warn('Initial background cache warmup deferred:', err.message);
    });
  }

  /**
   * Reload all landmarks from PostgreSQL into NestJS memory.
   * Runs on boot or when triggered by Admin actions. Includes retry logic for cold DBs.
   */
  async refreshCache(retries = 3, delayMs = 3000): Promise<void> {
    this.logger.log('🔄 Refreshing landmarks memory cache...');

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const allLandmarks = await this.prisma.landmark.findMany({
          where: { isActive: true },
          select: {
            id: true,
            name: true,
            aliases: true,
            description: true,
            city: true,
            state: true,
            latitude: true,
            longitude: true,
          },
        });

        const grouped = new Map<string, LandmarkResponse[]>();

        for (const landmark of allLandmarks) {
          const cityKey = landmark.city.toLowerCase().trim();
          if (!grouped.has(cityKey)) {
            grouped.set(cityKey, []);
          }
          grouped.get(cityKey)?.push(landmark);
        }

        this.cache = grouped;
        this.logger.log(
          `✅ Loaded landmarks into RAM for cities: [${Array.from(this.cache.keys()).join(', ')}]`
        );
        return; // Success, exit retry loop
      } catch (error: any) {
        this.logger.error(
          `Failed to load landmarks into cache (Attempt ${attempt}/${retries}): ${error.message}`
        );

        if (attempt < retries) {
          this.logger.log(`Waiting ${delayMs / 1000}s for DB connection before retry...`);
          await new Promise((res) => setTimeout(res, delayMs));
        } else {
          this.logger.warn(
            '⚠️ Landmark cache initialization failed. Will lazy-load when requested by clients.'
          );
        }
      }
    }
  }

  /**
   * Fast In-Memory GET endpoint handler. Zero Neon DB Compute usage.
   */
  getLandmarksByCity(city: string = 'Osogbo'): LandmarkResponse[] {
    const cityKey = city.toLowerCase().trim();
    return this.cache.get(cityKey) || [];
  }

  /**
   * Admin Endpoint: Create new Landmark in DB and refresh RAM cache.
   */
  async create(dto: CreateLandmarkDto) {
    const landmark = await this.prisma.landmark.create({
      data: {
        name: dto.name,
        aliases: dto.aliases || [],
        description: dto.description,
        city: dto.city,
        state: dto.state,
        latitude: dto.latitude,
        longitude: dto.longitude,
      },
    });

    // Invalidate and refresh cache so instant client fetches reflect the change
    await this.refreshCache();
    return landmark;
  }

  /**
   * Admin Endpoint: Toggle active status or soft delete.
   */
  async toggleActive(id: string, isActive: boolean) {
    const landmark = await this.prisma.landmark.update({
      where: { id },
      data: { isActive },
    });

    await this.refreshCache();
    return landmark;
  }

  /**
   * Search landmarks within RAM cache.
   */
  searchInRamCache(city: string = 'Osogbo', query: string): LandmarkResponse[] {
    if (!query || query.trim().length < 2) return [];

    const cleanQuery = query.toLowerCase().trim();
    const cityKey = city.toLowerCase().trim();
    const cityLandmarks = this.cache.get(cityKey) || [];

    return cityLandmarks
      .filter((item) => {
        // Check name match
        const nameMatches = item.name.toLowerCase().includes(cleanQuery);

        // Check aliases match (e.g. searching "garage" finds "Old Garage Roundabout")
        const aliasMatches = item.aliases?.some((alias) =>
          alias.toLowerCase().includes(cleanQuery),
        );

        return nameMatches || aliasMatches;
      })
      .slice(0, 8); // Limit to top 8 suggestions
  }
}