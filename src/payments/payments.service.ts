import { BadRequestException, Injectable, InternalServerErrorException, NotFoundException } from "@nestjs/common";

import { PrismaService } from '../providers/database/prisma.service'; 
import { firstValueFrom } from "rxjs";

import { HttpService } from '@nestjs/axios';
@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly httpService: HttpService,
  ) {}

async getPayments(customerId: string) {
  const payments = await this.prisma.payment.findMany({
    where: {
      customerId,
    },

    include: {
      shipment: {
        select: {
          id: true,
          trackingCode: true,
        },
      },
    },

    orderBy: {
      createdAt: "desc",
    },
  });

  const totalSpent = payments
    .filter(
      (payment) =>
        payment.status === "SUCCESS"
    )
    .reduce(
      (sum, payment) =>
        sum + Number(payment.amount),
      0
    );

  return {
    payments,

    summary: {
      totalSpent,
      totalTransactions: payments.length,
      lastPaymentDate:
        payments.length > 0
          ? payments[0].createdAt
          : null,
    },
  };
}

async getPayment(
  paymentId: string,
  customerId: string,
) {
  const payment = await this.prisma.payment.findFirst({
    where: {
      id: paymentId,
      customerId,
    },

    include: {
      shipment: {
        select: {
          id: true,
          trackingCode: true,
          pickupAddress: true,
          destinationAddress: true,
          recipient: true,
          recipientPhone: true,
          totalPrice: true,
          createdAt: true,
        },
      },
    },
  });

  if (!payment) {
    throw new NotFoundException("Payment not found");
  }

  return payment;
}

async resolveBankAccount(accountNumber: string, bankCode: string) {
    // Flutterwave Standard v3 Account Lookup Endpoint
    const url = 'https://api.flutterwave.com/v3/accounts/resolve';
    
    // Flutterwave requires a POST request body containing these keys
    const payload = {
      account_number: accountNumber,
      account_bank: bankCode,
    };

    try {
      const response = await firstValueFrom(
        this.httpService.post(url, payload, {
          headers: {
            Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
            'Content-Type': 'application/json',
          },
        }),
      );

      // Flutterwave returns: { status: "success", message: "...", data: { account_name: "..." } }
      if (response.data?.status === 'success' && response.data?.data) {
        return {
          accountName: response.data.data.account_name,
        };
      }
      
      throw new BadRequestException('Could not resolve account details with Flutterwave.');
    } catch (error: any) {
      console.error('Flutterwave Lookup Error Exception:', error.response?.data || error.message);
      
      // If Flutterwave returns an error status (like invalid account details)
      if (error.response?.status === 400 || error.response?.status === 422) {
        throw new BadRequestException(
          error.response?.data?.message || 'Invalid account number or bank code combinations.'
        );
      }
      
      throw new InternalServerErrorException('Flutterwave core clearance connection timeout.');
    }
  }

}