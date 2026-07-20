import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../providers/database/prisma.service';

import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateBankDto } from './dto/update-bank.dto';
import { UpdateAvailabilityDto } from './dto/update-availability.dto';

@Injectable()
export class RiderProfileService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  /**
   * ============================================================
   * GET RIDER PROFILE
   * ============================================================
   */
async getProfile(userId: string) {
  const rider =
    await this.prisma.riderProfile.findUnique({
      where: {
        userId,
      },
      include: {
        user: true,
      },
    });

  if (!rider) {
    throw new NotFoundException(
      'Rider profile not found.',
    );
  }

  return {
    id: rider.id,
    userId: rider.userId,

    firstName: rider.user.firstName,
    lastName: rider.user.lastName,
    email: rider.user.email,
    phoneNumber: rider.user.phoneNumber,
    avatarUrl: rider.user.avatarUrl,

    isOnline: rider.isOnline,
    ratingAverage: rider.ratingAverage,
    trustScore: rider.trustScore,
    completedDeliveries: rider.completedDeliveries,

    nin: rider.nin,
    driversLicense: rider.driversLicense,

    bankName: rider.bankName,
    bankCode: rider.bankCode,
    accountNumber: rider.accountNumber,
    accountName: rider.accountName,

    createdAt: rider.createdAt,
    updatedAt: rider.updatedAt,
  };
}
  /**
   * ============================================================
   * UPDATE RIDER PROFILE
   * ============================================================
   */
  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
  ) {
    const rider =
      await this.prisma.riderProfile.findUnique({
        where: {
          userId,
        },
        include: {
          user: true,
        },
      });

    if (!rider) {
      throw new NotFoundException(
        'Rider profile not found.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      /**
       * Update User table
       */
      await tx.user.update({
        where: {
          id: rider.userId,
        },
        data: {
          firstName:
            dto.firstName ??
            rider.user.firstName,

          lastName:
            dto.lastName ??
            rider.user.lastName,

          avatarUrl:
            dto.avatarUrl ??
            rider.user.avatarUrl,
        },
      });

      /**
       * Update Rider Profile table
       */
      await tx.riderProfile.update({
        where: {
          id: rider.id,
        },
        data: {
          nin:
            dto.nin ??
            rider.nin,

          driversLicense:
            dto.driversLicense ??
            rider.driversLicense,
        },
      });
    });

    return {
      success: true,
      message:
        'Profile updated successfully.',
    };
  }

  /**
   * ============================================================
   * UPDATE RIDER BANK DETAILS
   * ============================================================
   */
  async updateBank(
    userId: string,
    dto: UpdateBankDto,
  ) {
    /**
     * Find Rider
     */
    const rider =
      await this.prisma.riderProfile.findUnique({
        where: {
          userId,
        },
      });

    if (!rider) {
      throw new NotFoundException(
        'Rider profile not found.',
      );
    }

    /**
     * Update Bank Information
     */
    const updatedRider =
      await this.prisma.riderProfile.update({
        where: {
          id: rider.id,
        },
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


 async updateAvailability(
  userId: string,
  dto: UpdateAvailabilityDto,
) {
  const rider =
    await this.prisma.riderProfile.findUnique({
      where: {
        userId,
      },
    });

  if (!rider) {
    throw new NotFoundException(
      'Rider profile not found.',
    );
  }

  const updated =
    await this.prisma.riderProfile.update({
      where: {
        id: rider.id,
      },
      data: {
        isOnline: dto.isOnline,
      },
    });

  return {
    success: true,
    message: dto.isOnline
      ? 'You are now online.'
      : 'You are now offline.',
    isOnline: updated.isOnline,
  };
}
}