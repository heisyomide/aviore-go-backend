import { Module } from '@nestjs/common';

import { RiderProfileController } from './rider-profile.controller';
import { RiderProfileService } from './rider-profile.service';

import { PrismaService } from '../providers/database/prisma.service';

@Module({
  controllers: [RiderProfileController],
  providers: [
    RiderProfileService,
    PrismaService,
  ],
})
export class RiderProfileModule {}