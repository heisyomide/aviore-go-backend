import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '.prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  // 1. Keep the pool instance instance-scoped instead of static
  private pool: Pool;
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const dbUrl = process.env.DATABASE_URL;

    // 2. Configure SSL and TCP Keep-Alive parameters
    const pool = new Pool({
      connectionString: dbUrl,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      // Force underlying socket keep-alive probes to prevent cloud firewall silent drops
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000, 
      // Mandatory for Neon, Supabase, and AWS RDS SSL setups
      ssl: dbUrl?.includes('sslmode=require') || dbUrl?.includes('neon.tech') 
        ? { rejectUnauthorized: false } 
        : undefined,
    });

    // 3. Catch idle connection drops gracefully
    pool.on('error', (err) => {
      this.logger.warn(`⚠️ Background PostgreSQL client drop: ${err.message}`);
    });

    // 4. Wrap inside Prisma Driver Adapter
    const adapter = new PrismaPg(pool);

    // 5. Pass adapter to Prisma Client
    super({ adapter });

    this.pool = pool;
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
    if (this.pool) {
      await this.pool.end();
    }
  }
}