import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { PrismaService } from '../providers/database/prisma.service';
import { firstValueFrom } from 'rxjs';
import { InitializePaymentDto } from './dto/initialize-payment.dto';
import { TransferDto } from './dto/transfer.dto';

@Injectable()
export class FlutterwaveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly http: HttpService,
  ) {}

  private get headers() {
    return {
      Authorization: `Bearer ${this.config.get<string>('FLW_SECRET_KEY')}`,
      'Content-Type': 'application/json',
    };
  }

  async initializePayment(dto: InitializePaymentDto) {
    const txRef = `AV-${Date.now()}`;

    const payload = {
      tx_ref: txRef,
      amount: dto.amount,
      currency: 'NGN',
      redirect_url: dto.redirectUrl,
      customer: {
        email: dto.email,
        name: dto.customerName,
        phonenumber: dto.phone,
      },
      customizations: {
        title: 'Aviorè Go',
        description: 'Shipment Payment',
        logo: 'https://yourdomain.com/logo.png',
      },
      meta: {
        shipmentId: dto.shipmentId,
      },
    };

    try {
      const response = await firstValueFrom(
        this.http.post(
          'https://api.flutterwave.com/v3/payments',
          payload,
          { headers: this.headers },
        ),
      );

      await this.prisma.payment.create({
        data: {
          shipmentId: dto.shipmentId,
          customerId: dto.customerId,
          txRef,
          amount: dto.amount,
          currency: 'NGN',
          gateway: 'FLUTTERWAVE',
          status: 'PENDING',
        },
      });

      return response.data;
    } catch (error: any) {
  throw new InternalServerErrorException(
    error.response?.data?.message ??
    error.response?.data ??
    error.message ??
    'Flutterwave initialization failed',
  );
}
    }
  

  async verifyPayment(transactionId: string) {
    try {
      const response = await firstValueFrom(
        this.http.get(
          `https://api.flutterwave.com/v3/transactions/${transactionId}/verify`,
          { headers: this.headers },
        ),
      );

      const payment = response.data.data;

      await this.prisma.payment.update({
        where: {
          txRef: payment.tx_ref,
        },
        data: {
          status:
            payment.status === 'successful'
              ? 'SUCCESS'
              : 'FAILED',
          flutterwaveTxId: String(payment.id),
          flutterwaveRef: payment.flw_ref,
        },
      });

      return payment;
    } catch (error) {
      throw new BadRequestException('Verification failed');
    }
  }

  async withdraw(dto: TransferDto) {
    const payload = {
      account_bank: dto.accountBank,
      account_number: dto.accountNumber,
      amount: dto.amount,
      currency: 'NGN',
      narration: dto.narration,
      reference: `WD-${Date.now()}`,
      callback_url: dto.callbackUrl,
      debit_currency: 'NGN',
    };

    try {
      const response = await firstValueFrom(
        this.http.post(
          'https://api.flutterwave.com/v3/transfers',
          payload,
          {
            headers: this.headers,
          },
        ),
      );
const wallet = await this.prisma.wallet.findUnique({

  where: {

    userId: dto.riderId,

  },

});
if (!wallet) {

  throw new BadRequestException('Wallet not found');

}
const withdrawal = await this.prisma.withdrawal.create({
  
  data: {
    walletId: wallet.id,
    riderId: dto.riderId,
    amount: dto.amount,
    bankName: dto.bankName,
    bankCode: dto.accountBank,
    accountNumber: dto.accountNumber,
    accountName: dto.accountName,
    flutterwaveReference: payload.reference,
    status: 'PENDING',
  },
});

      await this.prisma.withdrawal.update({
  where: {
    id: withdrawal.id,
  },
  data: {
    flutterwaveId: String(response.data.data.id),
  },
});

      return response.data;
    } catch (error) {
      throw new InternalServerErrorException(
        'Withdrawal failed',
      );
    }
  }

  async getBanks() {
    const response = await firstValueFrom(
      this.http.get(
        'https://api.flutterwave.com/v3/banks/NG',
        {
          headers: this.headers,
        },
      ),
    );

    return response.data;
  }

  async resolveAccount(bankCode: string, accountNumber: string) {
    const response = await firstValueFrom(
      this.http.post(
        'https://api.flutterwave.com/v3/accounts/resolve',
        {
          account_number: accountNumber,
          account_bank: bankCode,
        },
        {
          headers: this.headers,
        },
      ),
    );

    return response.data;
  }
}