import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, RiderApplicationStatus, VehicleType } from '@prisma/client';
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
   * Generates a brand new anonymous rider onboarding application shell.
   * Returns metadata wrapper with explicit ID hook for Flutter persistence.
   */
  async createApplication() {
    const app = await this.prisma.riderApplication.create({
      data: {
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

  /**
   * Returns rider application by explicit ID string.
   */
  async getApplication(applicationId: string) {
    const application = await this.prisma.riderApplication.findUnique({
      where: { id: applicationId },
    });

    if (!application) {
      throw new NotFoundException('Application not found.');
    }

    return application;
  }

  /**
   * Returns onboarding progress metadata diagnostics using applicationId keys.
   */
  async getProgress(applicationId: string) {
    const application = await this.getApplication(applicationId);

    return {
      currentStep: application.currentStep,
      status: application.status,
      completedSteps: application.currentStep - 1,
      remainingSteps: Math.max(0, 7 - application.currentStep),
    };
  }

  /**
   * Generic database context updater abstracted away from authentication states.
   */
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
    return this.updateApplication(applicationId, 2, {
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      phoneNumber: dto.phoneNumber,
      middleName: dto.middleName,
      referralCode: dto.referralCode,
    });
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
    return this.updateApplication(applicationId, 6, {
      profilePhotoUrl: dto.profilePhotoUrl,
      driversLicenseUrl: dto.driversLicenseUrl,
      vehiclePaperUrl: dto.vehiclePaperUrl,
      insuranceUrl: dto.insuranceUrl,
      roadWorthinessUrl: dto.roadWorthinessUrl,
    });
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
   * Submits application, evaluates data completeness and filters against duplicates.
   */
  async submitApplication(applicationId: string) {
    const application = await this.getApplication(applicationId);

    // 1. Validation - Terms and Agreements
    if (
      !application.acceptedTerms ||
      !application.acceptedCommission ||
      !application.acceptedDeliveryPolicy
    ) {
      throw new BadRequestException(
        'You must accept all agreements before submitting.',
      );
    }

    // 2. Validation - Required Identity Credentials
    if (
      !application.idFrontUrl ||
      !application.idBackUrl ||
      !application.selfieUrl ||
      !application.idNumber ||
      !application.email ||
      !application.phoneNumber
    ) {
      throw new BadRequestException('Identity verification fields are incomplete.');
    }

    // 3. Validation - Required Vehicle Particulars
    if (
      !application.vehicleType ||
      !application.plateNumber ||
      !application.vehicleBrand ||
      !application.vehicleModel
    ) {
      throw new BadRequestException('Vehicle information is incomplete.');
    }

    // 4. Validation - Required Banking Payout Channels
    if (
      !application.bankName ||
      !application.accountNumber ||
      !application.accountName
    ) {
      throw new BadRequestException('Bank information is incomplete.');
    }

    // 5. Duplicate Submission Block checks
    if (
      application.status === RiderApplicationStatus.SUBMITTED ||
      application.status === RiderApplicationStatus.UNDER_REVIEW
    ) {
      throw new ConflictException('Application has already been submitted.');
    }

    /* ==========================================================
       6. SYSTEM UNIQUENESS AUDITS (Cross-checking system accounts)
       ========================================================== */

    // Check if the provided contact email conflicts with an active user account
    if (application.email) {
      const emailConflict = await this.prisma.user.findUnique({
        where: { email: application.email },
      });
      if (emailConflict) {
        throw new ConflictException('An account with this email address already exists.');
      }
    }

    // Check if the contact phone number conflicts with an active user account
    if (application.phoneNumber) {
      const phoneConflict = await this.prisma.user.findUnique({
        where: { phoneNumber: application.phoneNumber },
      });
      if (phoneConflict) {
        throw new ConflictException('An account with this phone number already exists.');
      }
    }

    // Check if vehicle plate is running in another submitted/approved processing scope
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
          id: { not: applicationId }, // Exclude current lookup shell
        },
      });
      if (plateConflict) {
        throw new ConflictException('This vehicle plate number is already attached to an open processing application.');
      }
    }

    // 7. Complete Submission Lifecycle and seal operational states
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