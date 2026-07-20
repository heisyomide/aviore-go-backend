// backend: src/rider/rider.controller.ts
import { Controller, Post, Body, Param, Patch } from '@nestjs/common';
import { RiderService } from './rider.service';
import { CompleteProfileDto } from './dto/complete-profile.dto';

@Controller('rider')
export class RiderController {
  constructor(private readonly riderService: RiderService) {}

  @Post('onboarding/submit') // 🔓 PUBLIC ENDPOINT: No Guard!
  async submitApplication(@Body() dto: CompleteProfileDto) {
    return this.riderService.saveIncomingApplication(dto);
  }

  @Patch('onboarding/:id/approve-test')
  async temporaryApprove(@Param('id') id: string) {
    return this.riderService.executeManualApproval(id);
  }
}