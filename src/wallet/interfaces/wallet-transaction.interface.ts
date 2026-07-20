export interface WalletTransaction {
  id: string;

  reference: string;

  amount: number;

  description: string;

  type: string;

  status: string;

  createdAt: Date;
}