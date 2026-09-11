import { Controller, Get, Patch, Body, UseGuards, Req } from '@nestjs/common';
import { MerchantService } from './merchant.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from 'src/auth/decorators/get-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('merchant/onboarding')
export class MerchantController {
  constructor(private readonly merchantService: MerchantService) {}

  @Get('profile')
  getProfile(@Req() req) {
    return this.merchantService.getProfile(req.user.sub || req.user.id);
  }

  @Patch('step-1')
  updateStep1(@Req() req, @Body() body) {
    return this.merchantService.updateStep1(req.user.sub || req.user.id, body);
  }

  @Patch('step-2')
  updateStep2(@Req() req, @Body() body) {
    return this.merchantService.updateStep2(req.user.sub || req.user.id, body);
  }

 @Patch('step-3')
updateStep3(@Req() req, @Body() body) {
  return this.merchantService.updateStep3(req.user.sub || req.user.id, body);
}

  @Patch('step-4')
  updateStep4(@Req() req, @Body() body) {
    return this.merchantService.updateStep4(req.user.sub || req.user.id, body);
  }

  @Patch('step-5')
  updateStep5(@Req() req, @Body() body) {
    return this.merchantService.updateStep5(req.user.sub || req.user.id, body);
  }
@Patch('step-6')
  async updateStep6(@GetUser() user: any, @Body() data: any) {
    // Extract the string userId safely whether @GetUser returns an object or a string
    const userId = typeof user === 'string' ? user : user.id || user.userId;
    return this.merchantService.updateStep6(userId, data);
  }
}