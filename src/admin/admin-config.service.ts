import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../providers/database/prisma.service';

@Injectable()
export class AdminConfigService implements OnModuleInit {
  // Fast synchronous in-memory storage matrix to prevent database compute locks
  private configCache: Map<string, string> = new Map();

  constructor(private prisma: PrismaService) {}

  /**
   * Automatically executes on NestJS module startup sequence to hydrate memory variables
   */
  async onModuleInit() {
    await this.hydrateCache();
  }

  /**
   * Aggregates configuration key-pairs from Neon database into runtime memory layout
   */
  async hydrateCache() {
    try {
      const configs = await this.prisma.globalConfig.findMany();
      this.configCache.clear();
      configs.forEach((cfg) => this.configCache.set(cfg.key, cfg.value));
      console.log('[AVIORÈ ENGINE] Global Operational Pricing configuration cache hydrated.');
    } catch (error) {
      console.error('[AVIORÈ ENGINE ERROR] Failed to hydrate global system configuration cache:', error);
    }
  }

  /**
   * High performance lookup returning text configurations synchronously
   */
  get(key: string, defaultValue: string): string {
    return this.configCache.get(key) || defaultValue;
  }

  /**
   * Resolves numerical metrics configurations safely (e.g. commission percentages or standard base base fees)
   */
  getNumber(key: string, defaultValue: number): number {
    const val = this.configCache.get(key);
    return val ? Number(val) : defaultValue;
  }

  /**
   * Sets new/updated application variables into the database and immediately updates runtime memory state
   */
  async updateConfig(key: string, value: string, description?: string) {
    const result = await this.prisma.globalConfig.upsert({
      where: { key },
      update: { value, description },
      create: { key, value, description },
    });
    
    // Instantly modify runtime cache matrix to implement shifts without requiring a system restart
    this.configCache.set(key, value);
    return { success: true, key, value, updatedRecord: result };
  }

  /**
   * Resolves a copy of the entire running operational variables map layout
   */
  getAllConfigs(): Record<string, string> {
    return Object.fromEntries(this.configCache);
  }
}