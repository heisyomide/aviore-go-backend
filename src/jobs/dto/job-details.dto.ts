export class JobDetailsDto {
  shipment!: ShipmentDto;
}

export class ShipmentDto {
  id!: string;
  trackingCode!: string;

  status!: string;

  packageCategory!: string;
  deliveryType!: string;
  weightRange!: string;

  description?: string;

  distanceKm!: number;
  estimatedMinutes!: number;

  totalPrice!: number;
  riderShare!: number;

  recipient!: RecipientDto;

  pickup!: AddressDto;

  destination!: AddressDto;

  verificationPin!: string;

  isExpress!: boolean;
  isFragile!: boolean;
  waterproof!: boolean;
  keepUpright!: boolean;
  handleWithCare!: boolean;
}

export class RecipientDto {
  name!: string;
  phoneNumber!: string;
}

export class AddressDto {
  address!: string;

  latitude!: number;

  longitude!: number;

  placeId!: string;
}