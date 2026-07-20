import { Injectable } from '@nestjs/common';

import { RiderApplicationEntity } from '../entities/rider-application.entity';

@Injectable()
export class ApplicationMapper {
  toEntity(application: any): RiderApplicationEntity {
    return {
      id: application.id,

      userId: application.userId,

      currentStep: application.currentStep,

      status: application.status,

      firstName: application.firstName,

      middleName: application.middleName,

      lastName: application.lastName,

      phoneNumber: application.phoneNumber,

      email: application.email,

      vehicleType: application.vehicleType,

      plateNumber: application.plateNumber,

      identityType: application.identityType,

      verificationStatus:
        application.verificationStatus,

      isSubmitted: application.isSubmitted,

      createdAt: application.createdAt,

      updatedAt: application.updatedAt,
    };
  }
}