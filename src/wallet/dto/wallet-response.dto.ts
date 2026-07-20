export class WalletResponseDto {
  availableBalance!: number;
  pendingBalance!: number;
  currency!: string;

  bankName!: string;
  bankCode!: string;
  accountNumber!: string;
  accountName!: string;
}