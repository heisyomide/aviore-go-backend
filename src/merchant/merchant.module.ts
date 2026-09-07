import { Module } from '@nestjs/common';
import { MerchantController } from './merchant.controller';
import { MerchantService } from './merchant.service';
import { MerchantDashboardController } from './merchant-dashboard.controller';
import { MerchantDashboardService } from './merchant-dashboard.service';
import { FlutterwaveModule } from 'src/flutterwave/flutterwave.module';
import { UploadsModule } from 'src/rider-onboarding/uploads/upload.module';
import { RiderOnboardingModule } from 'src/rider-onboarding/rider-onboarding.module';

@Module({
  imports: [FlutterwaveModule, UploadsModule, RiderOnboardingModule],
  controllers: [MerchantController, MerchantDashboardController],
  providers: [MerchantService, MerchantDashboardService],
  exports: [MerchantService],
})
export class MerchantModule {}