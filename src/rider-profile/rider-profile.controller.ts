import {
  Body,
  Controller,
  Get,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

import { RiderProfileService } from './rider-profile.service';

import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateBankDto } from './dto/update-bank.dto';
import { UpdateAvailabilityDto } from './dto/update-availability.dto';
import { GetUser } from 'src/auth/decorators/get-user.decorator';

@Controller('rider/profile')
@UseGuards(JwtAuthGuard)
export class RiderProfileController {
  constructor(
    private readonly riderProfileService: RiderProfileService,
  ) {}

  /**
   * ============================================================
   * GET RIDER PROFILE
   * GET /rider/profile
   * ============================================================
   */
  @Get()
  async getProfile(@Req() req: any) {
    return this.riderProfileService.getProfile(
      req.user.userId,
    );
  }

  /**
   * ============================================================
   * UPDATE PROFILE
   * PATCH /rider/profile
   * ============================================================
   */
  @Patch()
  async updateProfile(
    @Req() req: any,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.riderProfileService.updateProfile(
      req.user.userId,
      dto,
    );
  }

  /**
   * ============================================================
   * UPDATE BANK DETAILS
   * PATCH /rider/profile/bank
   * ============================================================
   */
  @Patch('bank')
  async updateBank(
    @Req() req: any,
    @Body() dto: UpdateBankDto,
  ) {
    return this.riderProfileService.updateBank(
      req.user.userId,
      dto,
    );
  }

 @Patch('availability')
updateAvailability(
  @GetUser() user: any,
  @Body() dto: UpdateAvailabilityDto,
) {
  return this.riderProfileService.updateAvailability(
    user.userId,
    dto,
  );
}
}