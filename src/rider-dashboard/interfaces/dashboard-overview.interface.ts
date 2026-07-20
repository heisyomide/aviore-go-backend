export interface RiderDashboardOverview {
  rider: RiderInformation;

  statistics: RiderDashboardStatistics;

  recentDeliveries: RecentDelivery[];
}

export interface RiderInformation {
  id: string;

  firstName: string;

  lastName: string;

  email: string;

  phoneNumber: string;

  avatarUrl?: string | null;

  isOnline: boolean;
}

export interface RiderDashboardStatistics {
  todaysEarnings: number;

  pendingWallet: number;

  availableJobs: number;

  completedDeliveries: number;

  riderRating: number;
}

export interface RecentDelivery {
  shipmentId: string;

  trackingCode: string;

  recipient: string;

  pickupAddress: string;

  destinationAddress: string;

  amountEarned: number;

  status: string;

  deliveredAt: Date;
}