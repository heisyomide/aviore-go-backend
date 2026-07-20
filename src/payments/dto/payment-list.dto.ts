import { PaymentResponse } from "../types/payment-response.type";
import { PaymentSummary } from "../types/payment-summary.type";

export class PaymentListDto {
  summary!: PaymentSummary;

  payments!: PaymentResponse[];
}