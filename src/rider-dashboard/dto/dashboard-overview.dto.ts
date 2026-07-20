export class RiderDashboardOverviewDto {
  rider!: RiderInfoDto;

  statistics!: RiderStatisticsDto;

  recentDeliveries!: RecentDeliveryDto[];
}

export class RiderInfoDto {
  id!: string;

  firstName!: string;

  lastName!: string;

  email!: string;

  phoneNumber!: string;

  avatarUrl?: string | null;

  isOnline!: boolean;
}

export class RiderStatisticsDto {
  todaysEarnings!: number;

  pendingWallet!: number;

  availableJobs!: number;

  completedDeliveries!: number;

  riderRating!: number;
}

export class RecentDeliveryDto {
  shipmentId!: string;

  trackingCode!: string;

  recipient!: string;

  pickupAddress!: string;

  destinationAddress!: string;

  amountEarned!: number;

  status!: string;

  deliveredAt!: Date;
}