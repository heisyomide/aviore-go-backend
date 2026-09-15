import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { MerchantWalletService, WalletResponseDto } from './merchant-wallet.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { IsNumber, Min } from 'class-validator';

export class WithdrawWalletDto {
  @IsNumber()
  @Min(100)
  amount!: number;
}

@Controller('merchant/wallet')
@UseGuards(JwtAuthGuard)
export class MerchantWalletController {
  constructor(private readonly merchantWalletService: MerchantWalletService) {}

  @Get()
  async getWalletSummary(@Request() req: any): Promise<WalletResponseDto> {
    const userId = req.user?.id || req.user?.userId || req.user?.sub;
    return this.merchantWalletService.getWalletSummary(userId);
  }

  @Get('transactions')
  async getTransactions(@Request() req: any) {
    const userId = req.user?.id || req.user?.userId || req.user?.sub;
    return this.merchantWalletService.getTransactions(userId);
  }

  @Post('withdraw')
  async requestWithdrawal(
    @Request() req: any,
    @Body() dto: WithdrawWalletDto,
  ) {
    const userId = req.user?.id || req.user?.userId || req.user?.sub;
    return this.merchantWalletService.requestWithdrawal(userId, dto.amount);
  }
}