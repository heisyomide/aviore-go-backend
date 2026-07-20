import { Module, forwardRef } from "@nestjs/common";
import { TrackingService } from "./tracking.service";
import { TrackingStore } from "./store/tracking.store";
import { TrackingGateway } from "./tracking.gateway";
import { PrismaService } from "../providers/database/prisma.service"; 
import { AdminModule } from "../admin/admin.module"; 
import { ShipmentsModule } from "../shipments/shipments.module"; // <--- 1. Add this import statement

@Module({
  imports: [
    forwardRef(() => AdminModule), 
    ShipmentsModule, // <--- 2. Add ShipmentsModule here to make its exports available to your gateway
  ],
  providers: [
    TrackingStore,
    TrackingService,
    TrackingGateway,
    PrismaService, 
  ],
  exports: [
    TrackingService,
    TrackingStore,
  ],
})
export class TrackingModule {}