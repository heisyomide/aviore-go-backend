import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '.prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private static pool: Pool;
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    // 1. Create a native PostgreSQL connection pool with keep-alive & idle controls
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10, // Maximum active client connections in pool
      idleTimeoutMillis: 30000, // Close idle connections after 30 seconds
      connectionTimeoutMillis: 10000, // 10-second connection timeout
      keepAlive: true, // Keep socket alive across cloud load balancers / Neon proxy
    });

    // 2. IMPORTANT: Catch background pool errors to prevent Node.js process crash on drop
    pool.on('error', (err) => {
      console.warn('⚠️ Idle PostgreSQL client error in pool (handled gracefully):', err.message);
    });

    // 3. Wrap inside the Prisma Driver Adapter layer
    const adapter = new PrismaPg(pool);

    // 4. Pass the adapter instance directly into the engine constructor
    super({ adapter });

    PrismaService.pool = pool;
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
    if (PrismaService.pool) {
      await PrismaService.pool.end();
    }
  }
}