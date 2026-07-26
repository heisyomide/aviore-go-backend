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

    // 🟢 2. SYNC TO USER TABLE: Persist names and actual phone number to User table
    if (application.userId) {
      await this.prisma.user.update({
        where: { id: application.userId },
        data: {
          firstName: dto.firstName,
          lastName: dto.lastName,
          ...(dto.phoneNumber && !dto.phoneNumber.startsWith('PENDING_')
            ? { phoneNumber: dto.phoneNumber }
            : {}),
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

    // 🟢 Sync profile picture to User table if provided
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
   * Submits application, evaluates data completeness and filters against external duplicates.
   */
  async submitApplication(applicationId: string, userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new UnauthorizedException('User account not found.');
    }

    if (user.status === IdentityStatus.PENDING_VERIFICATION) {
      throw new ForbiddenException(
        'Email address must be confirmed before submitting rider onboarding documentation.',
      );
    }

    const application = await this.getApplication(applicationId);

    // 1. Validation - Agreements
    if (
      !application.acceptedTerms ||
      !application.acceptedCommission ||
      !application.acceptedDeliveryPolicy
    ) {
      throw new BadRequestException(
        'You must accept all agreements before submitting.',
      );
    }

    // 2. Validation - Identity
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

    // 3. Validation - Vehicle
    if (
      !application.vehicleType ||
      !application.plateNumber ||
      !application.vehicleBrand ||
      !application.vehicleModel
    ) {
      throw new BadRequestException('Vehicle information is incomplete.');
    }

    // 4. Validation - Banking
    if (
      !application.bankName ||
      !application.accountNumber ||
      !application.accountName
    ) {
      throw new BadRequestException('Bank information is incomplete.');
    }

    // 5. Check if already submitted
    if (
      application.status === RiderApplicationStatus.SUBMITTED ||
      application.status === RiderApplicationStatus.UNDER_REVIEW
    ) {
      throw new ConflictException('Application has already been submitted.');
    }

    // 6. System Uniqueness Checks
    if (application.email) {
      const emailConflict = await this.prisma.user.findFirst({
        where: {
          email: application.email,
          id: { not: userId },
        },
      });
      if (emailConflict) {
        throw new ConflictException('An account with this email address already belongs to another user.');
      }
    }

    if (application.phoneNumber) {
      const phoneConflict = await this.prisma.user.findFirst({
        where: {
          phoneNumber: application.phoneNumber,
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

    // 🟢 7. FINAL SYNC TO USER & RIDER PROFILE TABLES
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        firstName: application.firstName || user.firstName,
        lastName: application.lastName || user.lastName,
        phoneNumber: application.phoneNumber || user.phoneNumber,
        avatarUrl: application.profilePhotoUrl || user.avatarUrl,
      },
    });

    // 8. Seal Application State
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