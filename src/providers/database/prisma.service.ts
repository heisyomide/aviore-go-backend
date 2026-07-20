import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '.prisma/client';
// ⚠️ Import dotenv here to catch early framework instantiation cycles
import * as dotenv from 'dotenv';
dotenv.config();

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private static pool: Pool;

  constructor() {
    // 1. Create a native PostgreSQL connection pool safely backed by environmental parsing
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });

    // 2. Wrap it inside the Prisma Driver Adapter layer
    const adapter = new PrismaPg(pool);

    // 3. Pass the adapter instance directly into the engine constructor
    super({ adapter });
    
    PrismaService.pool = pool;
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
    await PrismaService.pool.end();
  }
}