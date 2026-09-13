import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { MerchantWalletService } from './merchant-wallet.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'; // Adjust to your actual auth guard

@Controller('merchant/wallet')
@UseGuards(JwtAuthGuard)
export class MerchantWalletController {
  constructor(private readonly merchantWalletService: MerchantWalletService) {}

  @Get()
  async getWalletSummary(@Request() req) {
    const userId = req.user.id;
    return this.merchantWalletService.getWalletSummary(userId);
  }

  @Get('transactions')
  async getTransactions(@Request() req) {
    const userId = req.user.id;
    return this.merchantWalletService.getTransactions(userId);
  }
}