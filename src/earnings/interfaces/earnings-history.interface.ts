export interface EarningsHistory {
  id: string;

  trackingCode: string;

  date: Date;

  type: string;

  tripsCount: number;

  amount: number;

  status:
    | 'PROCESSING'
    | 'SETTLED';

  customerName: string;

  distanceKm: number;
}