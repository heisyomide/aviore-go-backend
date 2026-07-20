export interface PaymentResponse {
  id: string;

  shipmentId: string;

  trackingCode: string;

  amount: number;

  status: string;

  paymentMethod: string;

  transactionReference: string;

  createdAt: Date;
}