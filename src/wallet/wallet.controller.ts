import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WalletService } from './wallet.service';
import { WithdrawWalletDto } from './dto/withdraw.dto';

@Controller('rider/wallet')
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(
    private readonly walletService: WalletService,
  ) {}

  @Get()
  async getWallet(
    @Req() req: any,
  ) {
    return this.walletService.getWallet(
      req.user.userId,
    );
  }

  @Get('history')
  async getHistory(
    @Req() req: any,
  ) {
    return this.walletService.getTransactionHistory(
      req.user.userId,
    );
  }

  @Post('withdraw')
  async withdraw(
    @Req() req: any,
    @Body() dto: WithdrawWalletDto,
  ) {
    return this.walletService.requestWithdrawal(
      req.user.userId,
      dto.amount,
    );
  }
}