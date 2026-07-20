import { Module } from '@nestjs/common';

import { RiderOnboardingController } from './rider-onboarding.controller';
import { RiderOnboardingService } from './rider-onboarding.service';

import { PrismaService } from '../providers/database/prisma.service';

import { UploadsService } from './uploads/upload.service';
import { CloudinaryService } from './uploads/cloudinary.service';
import { CloudinaryProvider } from './uploads/cloudinary.provider';

@Module({
  controllers: [
    RiderOnboardingController,
  ],

  providers: [
    RiderOnboardingService,

    PrismaService,

    UploadsService,

    CloudinaryService,

    CloudinaryProvider,
  ],

  exports: [
    RiderOnboardingService,
  ],
})
export class RiderOnboardingModule {}