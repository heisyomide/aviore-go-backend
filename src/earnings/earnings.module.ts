import { Module } from '@nestjs/common';

import { RiderEarningsController } from './earnings.controller';
import { RiderEarningsService } from './earnings.service';

import { PrismaService } from '../providers/database/prisma.service';

@Module({
  controllers: [RiderEarningsController],
  providers: [
    RiderEarningsService,
    PrismaService,
  ],
})
export class EarningsModule {}