import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";

import { PaymentsService } from "./payments.service";
import { GetUser } from "../auth/decorators/get-user.decorator";
import { JwtAuthGuard } from "src/auth/guards/jwt-auth.guard";

@Controller("payments")
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
  ) {}

  // 1. Scoped Guard: Root endpoint
  @UseGuards(JwtAuthGuard)
  @Get()
  getPayments(@GetUser() user: any) {
    return this.paymentsService.getPayments(user.id);
  }

  // 2. Public Static Route: MUST BE DECLARED ABOVE THE :id ENDPOINT 🌟
  @Get('resolve-bank')
  async resolveBank(
    @Query('accountNumber') accountNumber: string,
    @Query('bankCode') bankCode: string,
  ) {
    if (!accountNumber || accountNumber.length !== 10) {
      throw new BadRequestException('A valid 10-digit NUBAN number is required.');
    }
    if (!bankCode) {
      throw new BadRequestException('Bank code parameter mapping is missing.');
    }

    return this.paymentsService.resolveBankAccount(accountNumber, bankCode);
  }

  // 3. Dynamic Param Route: Place at the very bottom so it doesn't hijack strings 🌟
  @UseGuards(JwtAuthGuard)
  @Get(":id")
  async getPayment(
    @Param("id") id: string,
    @GetUser() user: any,
  ) {
    return this.paymentsService.getPayment(id, user.id);
  }
}