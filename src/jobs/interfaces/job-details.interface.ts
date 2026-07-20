export interface JobDetails {
  shipment: {
    id: string;
    trackingCode: string;

    status: string;

    packageCategory: string;

    deliveryType: string;

    weightRange: string;

    description?: string;

    distanceKm: number;

    estimatedMinutes: number;

    totalPrice: number;

    riderShare: number;

    verificationPin: string;

    isExpress: boolean;

    isFragile: boolean;

    waterproof: boolean;

    keepUpright: boolean;

    handleWithCare: boolean;

    recipient: {
      name: string;
      phoneNumber: string;
    };

    pickup: {
      address: string;
      latitude: number;
      longitude: number;
      placeId: string;
    };

    destination: {
      address: string;
      latitude: number;
      longitude: number;
      placeId: string;
    };
  };
}