// src/organizer/organizer.controller.ts
import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common';
import { OrganizerService } from './organizer.service';
import { CreateOrganizerProfileDto } from './dto/create-organizer-profile.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'; // Adjust path to match your auth guard

@Controller('organizer')
@UseGuards(JwtAuthGuard)
export class OrganizerController {
  constructor(private readonly organizerService: OrganizerService) {}

  @Post('onboarding')
  async createOnboardingProfile(
    @Req() req,
    @Body() dto: CreateOrganizerProfileDto,
  ) {
    const userId = req.user.sub || req.user.id;
    return this.organizerService.createProfile(userId, dto);
  }
}