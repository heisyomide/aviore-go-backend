import { Payment } from "@prisma/client";

export function mapPayment(payment: any) {
  return {
    id: payment.id,

    shipmentId: payment.shipment.id,

    trackingCode: payment.shipment.trackingCode,

    amount: payment.amount,

    status: payment.status,

    paymentMethod: payment.paymentMethod,

    transactionReference: payment.transactionReference,

    createdAt: payment.createdAt,
  };
}