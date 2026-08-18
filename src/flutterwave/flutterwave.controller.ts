import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { FlutterwaveService } from './flutterwave.service';
import { InitializePaymentDto } from './dto/initialize-payment.dto';
import { TransferDto } from './dto/transfer.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'; // Adjust path to your JWT auth guard

@Controller('flutterwave')
export class FlutterwaveController {
  constructor(private readonly flutterwaveService: FlutterwaveService) {}

  @Post('initialize')
  @UseGuards(JwtAuthGuard) // <--- Protect endpoint and parse user context
  initialize(@Body() dto: InitializePaymentDto, @Req() req: any) {
    const userId = req.user?.id || req.user?.userId;
    return this.flutterwaveService.initializePayment(dto, userId);
  }

  @Get('verify/:transactionId')
  verify(@Param('transactionId') transactionId: string) {
    return this.flutterwaveService.verifyPayment(transactionId);
  }

  @Post('withdraw')
  @UseGuards(JwtAuthGuard)
  withdraw(@Req() req: any, @Body() dto: TransferDto) {
    const userId = req.user?.id || req.user?.userId || dto.riderId;
    return this.flutterwaveService.requestWithdrawal(userId, dto.amount);
  }

  @Get('banks')
  banks() {
    return this.flutterwaveService.getBanks();
  }

  @Get('resolve-account')
  resolve(
    @Query('bankCode') bankCode: string,
    @Query('accountNumber') accountNumber: string,
  ) {
    return this.flutterwaveService.resolveAccount(bankCode, accountNumber);
  }

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Headers('verif-hash') signature: string,
    @Body() payload: any,
  ) {
    return this.flutterwaveService.handleWebhook(signature, payload);
  }
}