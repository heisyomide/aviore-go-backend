import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../providers/database/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateBankDto } from './dto/update-bank.dto';
import { UpdateAvailabilityDto } from './dto/update-availability.dto';

@Injectable()
export class RiderProfileService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * ============================================================
   * GET RIDER PROFILE
   * ============================================================
   */
 async getProfile(userId: string) {
  let rider = await this.prisma.riderProfile.findUnique({
    where: { userId },
    include: { user: true },
  });

  if (!rider) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User account not found.');
    }

    rider = await this.prisma.riderProfile.create({
      data: { userId: user.id },
      include: { user: true },
    });
  }

  // Fetch rider onboarding application state if present
  const latestApplication = await this.prisma.riderApplication.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });

  const rawPhone = rider.user.phoneNumber || '';
  const cleanPhone = rawPhone.startsWith('PENDING_') ? '' : rawPhone;

  const firstName = rider.user.firstName || '';
  const lastName = rider.user.lastName || '';
  const emailPrefix = rider.user.email ? rider.user.email.split('@')[0] : '';
  const fullName = `${firstName} ${lastName}`.trim() || emailPrefix;

  // Safely extract string values for both statuses
  const identityStatus = rider.user.status ? String(rider.user.status) : 'PENDING_VERIFICATION';
  const applicationStatus = latestApplication?.status ? String(latestApplication.status) : 'NOT_STARTED';

  return {
    id: rider.id,
    userId: rider.userId,

    firstName,
    lastName,
    fullName,
    email: rider.user.email,
    phoneNumber: cleanPhone,
    
    // 🟢 Email / User Account Verification Status (e.g., 'VERIFIED')
    status: identityStatus, 
    accountStatus: identityStatus,

    // 🟢 Onboarding Application Status (e.g., 'APPROVED', 'SUBMITTED', 'IN_PROGRESS')
    applicationStatus, 

    avatarUrl: rider.user.avatarUrl || null,

    isOnline: rider.isOnline,
    ratingAverage: rider.ratingAverage,
    trustScore: rider.trustScore,
    completedDeliveries: rider.completedDeliveries,

    nin: rider.nin || null,
    driversLicense: rider.driversLicense || null,

    bankName: rider.bankName || null,
    bankCode: rider.bankCode || null,
    accountNumber: rider.accountNumber || null,
    accountName: rider.accountName || null,

    createdAt: rider.createdAt,
    updatedAt: rider.updatedAt,
  };
}
  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const rider = await this.prisma.riderProfile.findUnique({
      where: { userId },
      include: { user: true },
    });

    if (!rider) {
      throw new NotFoundException('Rider profile not found.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: rider.userId },
        data: {
          firstName: dto.firstName ?? rider.user.firstName,
          lastName: dto.lastName ?? rider.user.lastName,
          avatarUrl: dto.avatarUrl ?? rider.user.avatarUrl,
        },
      });

      await tx.riderProfile.update({
        where: { id: rider.id },
        data: {
          nin: dto.nin ?? rider.nin,
          driversLicense: dto.driversLicense ?? rider.driversLicense,
        },
      });
    });

    return {
      success: true,
      message: 'Profile updated successfully.',
    };
  }

  async updateBank(userId: string, dto: UpdateBankDto) {
    const rider = await this.prisma.riderProfile.findUnique({
      where: { userId },
    });

    if (!rider) {
      throw new NotFoundException('Rider profile not found.');
    }

    const updatedRider = await this.prisma.riderProfile.update({
      where: { id: rider.id },
      data: {
        bankName: dto.bankName,
        bankCode: dto.bankCode,
        accountNumber: dto.accountNumber,
        accountName: dto.accountName,
      },
    });

    return {
      success: true,
      message: 'Bank details updated successfully.',
      bank: {
        bankName: updatedRider.bankName,
        bankCode: updatedRider.bankCode,
        accountNumber: updatedRider.accountNumber,
        accountName: updatedRider.accountName,
      },
    };
  }

  async updateAvailability(userId: string, dto: UpdateAvailabilityDto) {
    const rider = await this.prisma.riderProfile.findUnique({
      where: { userId },
    });

    if (!rider) {
      throw new NotFoundException('Rider profile not found.');
    }

    const updated = await this.prisma.riderProfile.update({
      where: { id: rider.id },
      data: { isOnline: dto.isOnline },
    });

    return {
      success: true,
      message: dto.isOnline ? 'You are now online.' : 'You are now offline.',
      isOnline: updated.isOnline,
    };
  }
}