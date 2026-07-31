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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'; // 👈 Verify path to your JwtAuthGuard

import { CreateStep1Dto } from './dto/create-step-one.dto';
import { CreateStep2Dto } from './dto/step-two.dto';
import { CreateStep3Dto } from './dto/step-three.dto';
import { CreateStep4Dto } from './dto/step-four.dto';
import { CreateStep5Dto } from './dto/step-five.dto';
import { CreateStep6Dto } from './dto/step-six.dto';
import { CreateStep7Dto } from './dto/step-seven.dto';

@Controller('rider-onboarding')
@UseGuards(JwtAuthGuard)
export class RiderOnboardingController {
  constructor(
    private readonly onboardingService: RiderOnboardingService,
  ) {}

  /**
   * 🟢 STEP ZERO: Starts/Retrieves an onboarding session for the logged-in user.
   * Handles POST /rider-onboarding/start AND POST /rider-onboarding/application
   */
  @Post('start')
  startApplication(@Req() req: any) {
    const userId = req.user?.id || req.user?.userId || req.user?.sub;
    return this.onboardingService.createApplication(userId);
  }

  @Post('application')
  createOrGetApplication(@Req() req: any) {
    const userId = req.user?.id || req.user?.userId || req.user?.sub;
    return this.onboardingService.createApplication(userId);
  }

  /**
   * Retrieves raw state records for a given application ID.
   */
  @Get('application/:applicationId')
  getApplication(@Param('applicationId') applicationId: string) {
    return this.onboardingService.getApplication(applicationId);
  }

  /**
   * Computes remaining vs completed progress for the frontend.
   */
  @Get('progress/:applicationId')
  getProgress(@Param('applicationId') applicationId: string) {
    return this.onboardingService.getProgress(applicationId);
  }

  /* ==========================================================
     Multi-Step Data Persistence Routes (Supports both URL patterns)
     ========================================================== */

  // STEP 1 (Aliases: /step-1/:applicationId AND /:applicationId/step-1)
  @Post('step-1/:applicationId')
  saveStepOne(
    @Param('applicationId') applicationId: string,
    @Body() dto: CreateStep1Dto,
  ) {
    return this.onboardingService.saveStepOne(applicationId, dto);
  }

  @Post(':applicationId/step-1')
  saveStepOneAlt(
    @Param('applicationId') applicationId: string,
    @Body() dto: CreateStep1Dto,
  ) {
    return this.onboardingService.saveStepOne(applicationId, dto);
  }

  // STEP 2
  @Post('step-2/:applicationId')
  saveStepTwo(
    @Param('applicationId') applicationId: string,
    @Body() dto: CreateStep2Dto,
  ) {
    return this.onboardingService.saveStepTwo(applicationId, dto);
  }

  @Post(':applicationId/step-2')
  saveStepTwoAlt(
    @Param('applicationId') applicationId: string,
    @Body() dto: CreateStep2Dto,
  ) {
    return this.onboardingService.saveStepTwo(applicationId, dto);
  }

  // STEP 3
  @Post('step-3/:applicationId')
  saveStepThree(
    @Param('applicationId') applicationId: string,
    @Body() dto: CreateStep3Dto,
  ) {
    return this.onboardingService.saveStepThree(applicationId, dto);
  }

  @Post(':applicationId/step-3')
  saveStepThreeAlt(
    @Param('applicationId') applicationId: string,
    @Body() dto: CreateStep3Dto,
  ) {
    return this.onboardingService.saveStepThree(applicationId, dto);
  }

  // STEP 4
  @Post('step-4/:applicationId')
  saveStepFour(
    @Param('applicationId') applicationId: string,
    @Body() dto: CreateStep4Dto,
  ) {
    return this.onboardingService.saveStepFour(applicationId, dto);
  }

  @Post(':applicationId/step-4')
  saveStepFourAlt(
    @Param('applicationId') applicationId: string,
    @Body() dto: CreateStep4Dto,
  ) {
    return this.onboardingService.saveStepFour(applicationId, dto);
  }

  // STEP 5
  @Post('step-5/:applicationId')
  saveStepFive(
    @Param('applicationId') applicationId: string,
    @Body() dto: CreateStep5Dto,
  ) {
    return this.onboardingService.saveStepFive(applicationId, dto);
  }

  @Post(':applicationId/step-5')
  saveStepFiveAlt(
    @Param('applicationId') applicationId: string,
    @Body() dto: CreateStep5Dto,
  ) {
    return this.onboardingService.saveStepFive(applicationId, dto);
  }

  // STEP 6
  @Post('step-6/:applicationId')
  saveStepSix(
    @Param('applicationId') applicationId: string,
    @Body() dto: CreateStep6Dto,
  ) {
    return this.onboardingService.saveStepSix(applicationId, dto);
  }

  @Post(':applicationId/step-6')
  saveStepSixAlt(
    @Param('applicationId') applicationId: string,
    @Body() dto: CreateStep6Dto,
  ) {
    return this.onboardingService.saveStepSix(applicationId, dto);
  }

  // STEP 7
  @Post('step-7/:applicationId')
  saveStepSeven(
    @Param('applicationId') applicationId: string,
    @Body() dto: CreateStep7Dto,
  ) {
    return this.onboardingService.saveStepSeven(applicationId, dto);
  }

  @Post(':applicationId/step-7')
  saveStepSevenAlt(
    @Param('applicationId') applicationId: string,
    @Body() dto: CreateStep7Dto,
  ) {
    return this.onboardingService.saveStepSeven(applicationId, dto);
  }

  /**
   * Final submission endpoint.
   * Handles:
   * - POST /rider-onboarding/submit/:applicationId
   * - POST /rider-onboarding/:applicationId/submit
   * - POST /rider-onboarding/submit
   */
  @Post('submit/:applicationId')
  submit(
    @Param('applicationId') applicationId: string,
    @Req() req: any,
    @Body() dto: any,
  ) {
    const userId = req.user?.id || req.user?.userId || req.user?.sub;
    return this.onboardingService.submitApplication(applicationId, userId, dto);
  }

  @Post(':applicationId/submit')
  submitAlt(
    @Param('applicationId') applicationId: string,
    @Req() req: any,
    @Body() dto: any,
  ) {
    const userId = req.user?.id || req.user?.userId || req.user?.sub;
    return this.onboardingService.submitApplication(applicationId, userId, dto);
  }

  @Post('submit')
  submitDirect(@Req() req: any, @Body() dto: any) {
    const userId = req.user?.id || req.user?.userId || req.user?.sub;
    // Pass dto.applicationId if present in payload
    return this.onboardingService.submitApplication(dto?.applicationId, userId, dto);
  }
}