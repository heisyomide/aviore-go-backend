import {
  Body,
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';

import { RiderOnboardingService } from './rider-onboarding.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'; // 👈 Update path if your JwtAuthGuard is located elsewhere

import { CreateStep1Dto } from './dto/create-step-one.dto';
import { CreateStep2Dto } from './dto/step-two.dto';
import { CreateStep3Dto } from './dto/step-three.dto';
import { CreateStep4Dto } from './dto/step-four.dto';
import { CreateStep5Dto } from './dto/step-five.dto';
import { CreateStep6Dto } from './dto/step-six.dto';
import { CreateStep7Dto } from './dto/step-seven.dto';

@Controller('rider-onboarding')
export class RiderOnboardingController {
  constructor(
    private readonly onboardingService: RiderOnboardingService,
  ) {}

  /**
   * 🟢 STEP ZERO: Starts a rider onboarding process attached to the authenticated user.
   */
@UseGuards(JwtAuthGuard)
@Post('start')
startApplication(@Req() req) {
  // 🟢 Handles req.user.id, req.user.userId, and req.user.sub
  const userId = req.user?.id || req.user?.userId || req.user?.sub;
  return this.onboardingService.createApplication(userId);
}

  /**
   * Retrieves the raw state records for a given application ID.
   */
  @Get('application/:applicationId')
  getApplication(@Param('applicationId') applicationId: string) {
    return this.onboardingService.getApplication(applicationId);
  }

  /**
   * Computes remaining vs completed progress bars for the frontend.
   */
  @Get('progress/:applicationId')
  getProgress(@Param('applicationId') applicationId: string) {
    return this.onboardingService.getProgress(applicationId);
  }

  /* ==========================================================
     Multi-Step Data Persistence Routes (Stateful via Params)
     ========================================================== */

  @Post('step-1/:applicationId')
  saveStepOne(
    @Param('applicationId') applicationId: string,
    @Body() dto: CreateStep1Dto,
  ) {
    return this.onboardingService.saveStepOne(applicationId, dto);
  }

  @Post('step-2/:applicationId')
  saveStepTwo(
    @Param('applicationId') applicationId: string,
    @Body() dto: CreateStep2Dto,
  ) {
    return this.onboardingService.saveStepTwo(applicationId, dto);
  }

  @Post('step-3/:applicationId')
  saveStepThree(
    @Param('applicationId') applicationId: string,
    @Body() dto: CreateStep3Dto,
  ) {
    return this.onboardingService.saveStepThree(applicationId, dto);
  }

  @Post('step-4/:applicationId')
  saveStepFour(
    @Param('applicationId') applicationId: string,
    @Body() dto: CreateStep4Dto,
  ) {
    return this.onboardingService.saveStepFour(applicationId, dto);
  }

  @Post('step-5/:applicationId')
  saveStepFive(
    @Param('applicationId') applicationId: string,
    @Body() dto: CreateStep5Dto,
  ) {
    return this.onboardingService.saveStepFive(applicationId, dto);
  }

  @Post('step-6/:applicationId')
  saveStepSix(
    @Param('applicationId') applicationId: string,
    @Body() dto: CreateStep6Dto,
  ) {
    return this.onboardingService.saveStepSix(applicationId, dto);
  }

  @Post('step-7/:applicationId')
  saveStepSeven(
    @Param('applicationId') applicationId: string,
    @Body() dto: CreateStep7Dto,
  ) {
    return this.onboardingService.saveStepSeven(applicationId, dto);
  }

  /**
   * Final validation compilation check and review state submission seal.
   */
@UseGuards(JwtAuthGuard)
@Post('submit/:applicationId')
submit(
  @Param('applicationId') applicationId: string,
  @Req() req,
  @Body() dto: any,
) {
  const userId = req.user.id || req.user.sub;
  return this.onboardingService.submitApplication(applicationId, userId, dto);
}
}