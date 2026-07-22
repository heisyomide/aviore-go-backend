import { Module } from '@nestjs/common';
import { DatabaseModule } from './providers/database/database.module';
import { UsersModule } from './users/users.module';
import { UsersService } from './users/users.service';
import { AuthModule } from './auth/auth.module';
import { AuthService } from './auth/auth.service';
import { AuthController } from './auth/auth.controller';
import { ScheduleModule } from '@nestjs/schedule';
import { ShipmentsModule } from './shipments/shipments.module';
import { AdminController } from './admin/admin.controller';
import { PricingModule } from './pricing/pricing.module';
import { FlutterwaveModule } from './flutterwave/flutterwave.module';
import { TrackingModule } from './tracking/tracking.module';
import { PaymentsModule } from './payments/payments.module';
import { ProfileModule } from './profile/profile.module';
import { RiderDashboardModule } from './rider-dashboard/rider-dashboard.module';
import { RiderJobsModule } from './jobs/job.module';
import { EarningsModule } from './earnings/earnings.module';
import { WalletModule } from './wallet/wallet.module';
import { RiderProfileModule } from './rider-profile/rider-profile.module';
import { RealtimeModule } from './realtime/realtime.module';
import { RiderOnboardingModule } from './rider-onboarding/rider-onboarding.module';
import { UploadsModule } from './rider-onboarding/uploads/upload.module';
import { RiderModule } from './rider/rider.module';
import { AdminModule } from './admin/admin.module';
import { LandmarksModule } from './landmarks/landmarks.module';
import { HealthController } from './health/health.controller';
import { HealthModule } from './health/health.module';

@Module({
  imports: [DatabaseModule, LandmarksModule, HealthModule, UploadsModule, AdminModule, RiderOnboardingModule, RealtimeModule, ProfileModule, RiderJobsModule, EarningsModule, 
    RiderDashboardModule, FlutterwaveModule , PricingModule,UsersModule, 
    PaymentsModule, TrackingModule, AuthModule, RiderProfileModule, WalletModule, ShipmentsModule,ScheduleModule.forRoot(), RiderModule,],
  controllers: [],
  providers: [UsersService, AuthService],
})
export class AppModule {}