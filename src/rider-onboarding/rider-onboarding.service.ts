import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, RiderApplicationStatus, IdentityStatus } from '@prisma/client';
import { PrismaService } from '../providers/database/prisma.service';

// DTO Imports
import { CreateStep1Dto } from './dto/create-step-one.dto';
import { CreateStep2Dto } from './dto/step-two.dto';
import { CreateStep3Dto } from './dto/step-three.dto';
import { CreateStep4Dto } from './dto/step-four.dto';
import { CreateStep5Dto } from './dto/step-five.dto';
import { CreateStep6Dto } from './dto/step-six.dto';
import { CreateStep7Dto } from './dto/step-seven.dto';

@Injectable()
export class RiderOnboardingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generates a brand new rider onboarding application shell attached to authenticated user.
   */
  async createApplication(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new UnauthorizedException('User account not found.');
    }

    if (user.status === IdentityStatus.PENDING_VERIFICATION) {
      throw new ForbiddenException(
        'Please verify your email address before initiating rider onboarding.',
      );
    }

    const app = await this.prisma.riderApplication.create({
      data: {
        userId: user.id,
        email: user.email,
        currentStep: 1,
        status: RiderApplicationStatus.DRAFT,
      },
    });

    return {
      success: true,
      applicationId: app.id,
      currentStep: app.currentStep,
      status: app.status,
    };
  }

  async getApplication(applicationId: string) {
    const application = await this.prisma.riderApplication.findUnique({
      where: { id: applicationId },
    });

    if (!application) {
      throw new NotFoundException('Application not found.');
    }

    return application;
  }

  async getProgress(applicationId: string) {
    const application = await this.getApplication(applicationId);

    return {
      currentStep: application.currentStep,
      status: application.status,
      completedSteps: application.currentStep - 1,
      remainingSteps: Math.max(0, 7 - application.currentStep),
    };
  }

  private async updateApplication(
    applicationId: string,
    step: number,
    data: Prisma.RiderApplicationUpdateInput,
  ) {
    const application = await this.getApplication(applicationId);

    return this.prisma.riderApplication.update({
      where: { id: applicationId },
      data: {
        ...data,
        currentStep: Math.max(application.currentStep, step),
        status:
          application.status === RiderApplicationStatus.DRAFT
            ? RiderApplicationStatus.IN_PROGRESS
            : application.status,
      },
    });
  }

  /* ==========================================
     Onboarding Multi-Step Progression Savers
     ========================================== */

  async saveStepOne(applicationId: string, dto: CreateStep1Dto) {
    // 1. Update Application table
    const application = await this.updateApplication(applicationId, 2, {
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      phoneNumber: dto.phoneNumber,
      middleName: dto.middleName,
      referralCode: dto.referralCode,
    });

    // 2. SYNC TO USER TABLE: Persist names and actual phone number to User table
    if (application.userId) {
      const isRealPhone =
        dto.phoneNumber &&
        typeof dto.phoneNumber === 'string' &&
        dto.phoneNumber.trim().length > 0 &&
        !dto.phoneNumber.startsWith('PENDING_');

      await this.prisma.user.update({
        where: { id: application.userId },
        data: {
          ...(dto.firstName ? { firstName: dto.firstName.trim() } : {}),
          ...(dto.lastName ? { lastName: dto.lastName.trim() } : {}),
          ...(isRealPhone ? { phoneNumber: dto.phoneNumber.trim() } : {}),
        },
      });
    }

    return application;
  }

  async saveStepTwo(applicationId: string, dto: CreateStep2Dto) {
    return this.updateApplication(applicationId, 3, {
      dateOfBirth: dto.dateOfBirth,
      gender: dto.gender,
      residentialAddress: dto.residentialAddress,
      state: dto.state,
      city: dto.city,
      localGovernment: dto.localGovernment,
      emergencyContactName: dto.emergencyContactName,
      emergencyContactPhone: dto.emergencyContactPhone,
      emergencyRelationship: dto.emergencyRelationship,
    });
  }

  async saveStepThree(applicationId: string, dto: CreateStep3Dto) {
    return this.updateApplication(applicationId, 4, {
      idType: dto.idType,
      idNumber: dto.idNumber,
      idFrontUrl: dto.idFrontUrl,
      idBackUrl: dto.idBackUrl,
      selfieUrl: dto.selfieUrl,
    });
  }

  async saveStepFour(applicationId: string, dto: CreateStep4Dto) {
    return this.updateApplication(applicationId, 5, {
      vehicleType: dto.vehicleType,
      plateNumber: dto.plateNumber,
      vehicleBrand: dto.vehicleBrand,
      vehicleModel: dto.vehicleModel,
      vehicleColor: dto.vehicleColor,
      vehicleYear: dto.vehicleYear,
      vehiclePhotoUrl: dto.vehiclePhotoUrl,
    });
  }

  async saveStepFive(applicationId: string, dto: CreateStep5Dto) {
    const updatedApp = await this.updateApplication(applicationId, 6, {
      profilePhotoUrl: dto.profilePhotoUrl,
      driversLicenseUrl: dto.driversLicenseUrl,
      vehiclePaperUrl: dto.vehiclePaperUrl,
      insuranceUrl: dto.insuranceUrl,
      roadWorthinessUrl: dto.roadWorthinessUrl,
    });

    if (dto.profilePhotoUrl && updatedApp.userId) {
      await this.prisma.user.update({
        where: { id: updatedApp.userId },
        data: { avatarUrl: dto.profilePhotoUrl },
      });
    }

    return updatedApp;
  }

  async saveStepSix(applicationId: string, dto: CreateStep6Dto) {
    return this.updateApplication(applicationId, 7, {
      bankName: dto.bankName,
      bankCode: dto.bankCode,
      accountNumber: dto.accountNumber,
      accountName: dto.accountName,
    });
  }

  async saveStepSeven(applicationId: string, dto: CreateStep7Dto) {
    return this.updateApplication(applicationId, 7, {
      acceptedTerms: dto.acceptedTerms,
      acceptedCommission: dto.acceptedCommission,
      acceptedDeliveryPolicy: dto.acceptedDeliveryPolicy,
    });
  }

  /**
   * Submits application, evaluates data completeness and syncs names and phone directly to User record.
   */
  async submitApplication(applicationId: string, userId: string, dto?: any) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new UnauthorizedException('User account not found.');
    }

    if (user.status === IdentityStatus.PENDING_VERIFICATION) {
      throw new ForbiddenException(
        'Email address must be confirmed before submitting rider onboarding documentation.',
      );
    }

    // 🟢 1. Extract values flexibly (handles both camelCase and snake_case or phone alias)
    const submittedFirstName = dto?.firstName || dto?.first_name || undefined;
    const submittedLastName = dto?.lastName || dto?.last_name || undefined;
    const submittedPhone = dto?.phoneNumber || dto?.phone || dto?.mobile || undefined;

    // 🟢 2. UPDATE DRAFT RIDER APPLICATION RECORD WITH SUBMITTED DTO
    if (dto && Object.keys(dto).length > 0) {
      const parsedDob = dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined;
      const vehicleYearInt = dto.vehicleYear ? parseInt(String(dto.vehicleYear), 10) : undefined;

      await this.prisma.riderApplication.update({
        where: { id: applicationId },
        data: {
          firstName: submittedFirstName ?? undefined,
          lastName: submittedLastName ?? undefined,
          middleName: dto.middleName ?? undefined,
          phoneNumber: submittedPhone ?? undefined,
          email: dto.email ?? undefined,
          dateOfBirth: parsedDob,
          gender: dto.gender ?? undefined,
          residentialAddress: dto.residentialAddress ?? undefined,
          state: dto.state ?? undefined,
          city: dto.city ?? undefined,
          localGovernment: dto.lga || dto.localGovernment || undefined,
          emergencyContactName: dto.emergencyContactName ?? undefined,
          emergencyContactPhone: dto.emergencyContactPhone ?? undefined,
          emergencyRelationship: dto.emergencyRelationship || dto.emergencyContactRelationship || undefined,
          idType: dto.idType ?? undefined,
          idNumber: dto.idNumber ?? undefined,
          idFrontUrl: dto.idFrontImage || dto.idFrontUrl || undefined,
          idBackUrl: dto.idBackImage || dto.idBackUrl || undefined,
          selfieUrl: dto.selfieImage || dto.selfieUrl || undefined,
          vehicleType: dto.vehicleType ?? undefined,
          plateNumber: dto.plateNumber ?? undefined,
          vehicleBrand: dto.vehicleBrand ?? undefined,
          vehicleModel: dto.vehicleModel ?? undefined,
          vehicleColor: dto.vehicleColor ?? undefined,
          vehicleYear: vehicleYearInt,
          vehiclePhotoUrl: dto.vehiclePhoto || dto.vehiclePhotoUrl || undefined,
          driversLicenseUrl: dto.driversLicenseDoc || dto.driversLicenseUrl || undefined,
          vehiclePaperUrl: dto.vehiclePaperDoc || dto.vehiclePaperUrl || undefined,
          insuranceUrl: dto.insuranceDoc || dto.insuranceUrl || undefined,
          roadWorthinessUrl: dto.roadWorthinessDoc || dto.roadWorthinessUrl || undefined,
          bankName: dto.bankName ?? undefined,
          bankCode: dto.bankCode ?? undefined,
          accountNumber: dto.accountNumber ?? undefined,
          accountName: dto.accountName ?? undefined,
          acceptedTerms: dto.acceptedTerms ?? undefined,
          acceptedCommission: dto.acceptedCommission ?? undefined,
          acceptedDeliveryPolicy: dto.acceptedPrivacy ?? dto.acceptedDeliveryPolicy ?? undefined,
        },
      });
    }

    // Fetch the fresh application record
    const application = await this.getApplication(applicationId);

    // 🟢 3. RESOLVE REAL VALUES FOR USER SYNC (Ignore PENDING_ string completely)
    const finalFirstName = submittedFirstName || application.firstName || user.firstName;
    const finalLastName = submittedLastName || application.lastName || user.lastName;

    const phoneCandidates = [submittedPhone, application.phoneNumber];
    const finalPhone = phoneCandidates.find(
      (p) => typeof p === 'string' && p.trim().length > 0 && !p.startsWith('PENDING_'),
    );

    // 🟢 4. System Uniqueness Checks
    if (finalPhone) {
      const phoneConflict = await this.prisma.user.findFirst({
        where: {
          phoneNumber: finalPhone,
          id: { not: userId },
        },
      });
      if (phoneConflict) {
        throw new ConflictException('An account with this phone number already belongs to another user.');
      }
    }

    if (application.plateNumber) {
      const plateConflict = await this.prisma.riderApplication.findFirst({
        where: {
          plateNumber: application.plateNumber,
          status: {
            in: [
              RiderApplicationStatus.SUBMITTED,
              RiderApplicationStatus.UNDER_REVIEW,
            ],
          },
          id: { not: applicationId },
        },
      });
      if (plateConflict) {
        throw new ConflictException(
          'This vehicle plate number is already attached to an open processing application.',
        );
      }
    }

    // 🟢 5. FORCE SYNC TO USER TABLE (PERMANENTLY OVERWRITES PENDING_ PHONE NUMBER AND BLANK NAMES)
    const userUpdatePayload: Prisma.UserUpdateInput = {};

    if (finalFirstName && finalFirstName.trim() !== '') {
      userUpdatePayload.firstName = finalFirstName.trim();
    }

    if (finalLastName && finalLastName.trim() !== '') {
      userUpdatePayload.lastName = finalLastName.trim();
    }

    if (finalPhone && finalPhone.trim() !== '') {
      userUpdatePayload.phoneNumber = finalPhone.trim();
    }

    if (application.profilePhotoUrl || application.selfieUrl) {
      userUpdatePayload.avatarUrl = application.profilePhotoUrl || application.selfieUrl;
    }

    if (Object.keys(userUpdatePayload).length > 0) {
      await this.prisma.user.update({
        where: { id: userId },
        data: userUpdatePayload,
      });
    }

    // 6. Seal Application State
    const updated = await this.prisma.riderApplication.update({
      where: { id: applicationId },
      data: {
        status: RiderApplicationStatus.SUBMITTED,
        submittedAt: new Date(),
        currentStep: 7,
      },
    });

    return {
      success: true,
      message:
        'Application submitted successfully. Our team will review your documents.',
      application: updated,
    };
  }
}