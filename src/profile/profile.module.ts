import { Module } from "@nestjs/common";

import { ProfileController } from "./profile.controller";
import { ProfileService } from "./profile.service";

import { PrismaService } from "../providers/database/prisma.service";
import { LandmarksModule } from "../landmarks/landmarks.module"; // Adjust path if needed

@Module({
  imports: [
    LandmarksModule, // Required to make LandmarksService available to ProfileService
  ],

  controllers: [
    ProfileController,
  ],

  providers: [
    ProfileService,
    PrismaService,
  ],

  exports: [
    ProfileService,
  ],
})
export class ProfileModule {}