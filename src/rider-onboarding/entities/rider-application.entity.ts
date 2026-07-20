export class RiderApplicationEntity {
  id!: string;

  userId!: string;

  currentStep!: number;

  status!: string;

  firstName!: string;

  middleName?: string;

  lastName!: string;

  phoneNumber!: string;

  email!: string;

  vehicleType?: string;

  plateNumber?: string;

  identityType?: string;

  verificationStatus!: string;

  isSubmitted!: boolean;

  createdAt!: Date;

  updatedAt!: Date;
}