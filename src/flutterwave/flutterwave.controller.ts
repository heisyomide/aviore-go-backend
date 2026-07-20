import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { FlutterwaveService } from './flutterwave.service';
import { InitializePaymentDto } from './dto/initialize-payment.dto';
import { TransferDto } from './dto/transfer.dto';

@Controller('flutterwave')
export class FlutterwaveController {
  constructor(
    private readonly flutterwaveService: FlutterwaveService,
  ) {}

  @Post('initialize')
  initialize(
    @Body() dto: InitializePaymentDto,
  ) {
    return this.flutterwaveService.initializePayment(dto);
  }

  @Get('verify/:transactionId')
  verify(
    @Param('transactionId')
    transactionId: string,
  ) {
    return this.flutterwaveService.verifyPayment(
      transactionId,
    );
  }

  @Post('withdraw')
  withdraw(
    @Body() dto: TransferDto,
  ) {
    return this.flutterwaveService.withdraw(dto);
  }

  @Get('banks')
  banks() {
    return this.flutterwaveService.getBanks();
  }

  @Get('resolve-account')
  resolve(
    @Query('bankCode') bankCode: string,
    @Query('accountNumber')
    accountNumber: string,
  ) {
    return this.flutterwaveService.resolveAccount(
      bankCode,
      accountNumber,
    );
  }
}