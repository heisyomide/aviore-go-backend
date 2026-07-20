import { EarningsHistory } from './earnings-history.interface';

export interface EarningsStatistics {
  weeklyGross: number;

  completedTrips: number;

  activeRoadHours: number;

  averagePerHour: number;
}

export interface EarningsChartItem {
  day: string;

  amount: number;
}

export interface EarningsOverview {
  statistics: EarningsStatistics;

  chart: EarningsChartItem[];

  history: EarningsHistory[];
}