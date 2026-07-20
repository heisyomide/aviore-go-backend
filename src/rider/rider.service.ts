// backend: src/rider/rider.service.ts
import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../providers/database/prisma.service';
import { CompleteProfileDto } from './dto/complete-profile.dto';
import { RiderApplicationStatus, UserRole, IdentityStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class RiderService {
  constructor(private readonly prisma: PrismaService) {}

  async saveIncomingApplication(dto: CompleteProfileDto) {
    try {
      // 🌟 Create a fresh application bucket with NO user link yet
      const newApplication = await this.prisma.riderApplication.create({
        data: {
          firstName: dto.firstName,
          lastName: dto.lastName,
          email: dto.email,
          phoneNumber: dto.phoneNumber,
          middleName: dto.middleName,
          dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
          gender: dto.gender as any,
          residentialAddress: dto.residentialAddress,
          state: dto.state,
          city: dto.city,
          localGovernment: dto.lga,
          emergencyContactName: dto.emergencyContactName,
          emergencyContactPhone: dto.emergencyContactPhone,
          emergencyRelationship: dto.emergencyContactRelationship,
          idType: dto.idType as any,
          idNumber: dto.idNumber,
          idFrontUrl: dto.idFrontImage,
          idBackUrl: dto.idBackImage,
          selfieUrl: dto.selfieImage,
          vehicleType: dto.vehicleType as any,
          plateNumber: dto.plateNumber,
          vehicleBrand: dto.vehicleBrand,
          vehicleModel: dto.vehicleModel,
          vehicleColor: dto.vehicleColor,
          vehicleYear: dto.vehicleYear ? parseInt(dto.vehicleYear) : null,
          vehiclePhotoUrl: dto.vehiclePhoto,
          driversLicenseUrl: dto.driversLicenseDoc,
          vehiclePaperUrl: dto.vehiclePaperDoc,
          insuranceUrl: dto.insuranceDoc,
          roadWorthinessUrl: dto.roadWorthinessDoc,
          bankName: dto.bankName,
          bankCode: dto.bankCode,
          accountNumber: dto.accountNumber,
          accountName: dto.accountName,
          acceptedTerms: dto.acceptedTerms || false,
          acceptedCommission: dto.acceptedCommission || false,
          acceptedDeliveryPolicy: dto.acceptedPrivacy || false,
          
          currentStep: 6,
          status: RiderApplicationStatus.SUBMITTED, // 📥 Mark as ready for review
        },
      });

      return {
        success: true,
        message: 'Application submitted successfully for admin review.',
        applicationId: newApplication.id,
      };
    } catch (error) {
      console.error(error);
      throw new BadRequestException('Failed to process onboarding application submission.');
    }
  }

  // 🌟 FIX COMPLETE: Added string fallback operators to satisfy non-nullable fields
  async executeManualApproval(applicationId: string) {
  const app = await this.prisma.riderApplication.findUnique({
    where: { id: applicationId }
  });

  if (!app) {
    throw new BadRequestException('Application profile records not found');
  }
  if (!app.email || !app.phoneNumber || !app.firstName || !app.lastName) {
    throw new BadRequestException('Application missing core identity credentials (Email/Phone/Name).');
  }

  // 🌟 GUARD 1: Check if the application has already been processed and approved
  if (app.status === RiderApplicationStatus.APPROVED || app.userId) {
    throw new ConflictException('This application has already been approved and provisioned.');
  }

  // 🌟 GUARD 2: Check if another user is already using this phone number or email
  const existingUser = await this.prisma.user.findFirst({
    where: {
      OR: [
        { email: app.email },
        { phoneNumber: app.phoneNumber }
      ]
    }
  });

  if (existingUser) {
    const fieldConflict = existingUser.email === app.email ? 'email' : 'phone number';
    throw new ConflictException(
      `Cannot approve. A user account with this ${fieldConflict} (${
        fieldConflict === 'email' ? app.email : app.phoneNumber
      }) already exists in the system.`
    );
  }

  return this.prisma.$transaction(async (tx) => {
    // 1. Generate a secure fallback password hash they can change on first dashboard entry
    const passwordHash = await bcrypt.hash('WelcomeAvio123!', 10);

    // 2. Provision the live user record inside the 'users' table 🌟
    const newUser = await tx.user.create({
      data: {
        email: app.email || "",
        phoneNumber: app.phoneNumber || "",
        passwordHash: passwordHash,
        firstName: app.firstName || "",
        lastName: app.lastName || "",
        role: UserRole.RIDER,               // Promoted immediately 
        status: IdentityStatus.VERIFIED,     // Activated instantly
      }
    });

    // 3. Map tracking profiles directly inside the permanent 'rider_profiles' structure 🌟
    const newProfile = await tx.riderProfile.create({
      data: {
        userId: newUser.id, // Securely locks the 1-to-1 connection
        bankName: app.bankName || '',
        bankCode: app.bankCode || '',
        accountNumber: app.accountNumber || '',
        accountName: app.accountName || '',
        driversLicense: app.idType === 'DRIVERS_LICENSE' ? app.idNumber : null,
        nin: app.idType === 'NIN' ? app.idNumber : null,
        isOnline: false,
        ratingAverage: 5.0,
        trustScore: 100,
      }
    });

    // 4. Update the source onboarding entry status to prevent duplicate profile creation loops
    await tx.riderApplication.update({
      where: { id: applicationId },
      data: { 
        status: RiderApplicationStatus.APPROVED,
        userId: newUser.id 
      }
    });

    return {
      success: true,
      message: `Account created successfully! ${app.firstName} is now live in the users table. Temporary password: WelcomeAvio123!`,
      profileId: newProfile.id,
      userId: newUser.id
    };
  });
}
}