import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../providers/database/prisma.service';

@Injectable()
export class MerchantService {
  constructor(private prisma: PrismaService) {}

  async getProfile(userId: string) {
    const profile = await this.prisma.merchantProfile.findUnique({
      where: { userId },
      include: { operatingHours: true, bankAccount: true, menuItems: true, landmark: true },
    });
    if (!profile) throw new NotFoundException('Merchant profile not found.');
    return profile;
  }

  // Step 1 — Business Information & Branding
  async updateStep1(
    userId: string,
    data: {
      businessName: string;
      merchantType?: any;
      description: string;
      cuisineType: string;
      phone: string;
      logoUrl?: string;
      coverUrl?: string;
    }
  ) {
    return this.prisma.merchantProfile.upsert({
      where: { userId },
      create: {
        userId,
        businessName: data.businessName,
        merchantType: data.merchantType || 'FOOD',
        description: data.description,
        cuisineType: data.cuisineType,
        phone: data.phone,
        logoUrl: data.logoUrl,
        coverUrl: data.coverUrl,
        onboardingStep: 2,
        isOnboardingComplete: false,
      },
      update: {
        businessName: data.businessName,
        merchantType: data.merchantType,
        description: data.description,
        cuisineType: data.cuisineType,
        phone: data.phone,
        logoUrl: data.logoUrl,
        coverUrl: data.coverUrl,
        onboardingStep: 2,
      },
    });
  }

  // Step 2 — Business Location & GPS Coords matching your exact schema fields
  async updateStep2(
    userId: string,
    data: {
      address: string;
      landmarkId?: string;
      latitude: number;
      longitude: number;
    }
  ) {
    return this.prisma.merchantProfile.update({
      where: { userId },
      data: {
        address: data.address,
        latitude: data.latitude,
        longitude: data.longitude,
        landmarkId: data.landmarkId,
        onboardingStep: 3,
      },
    });
  }

  // Step 3 — Owner / Contact KYC Information
  async updateStep3(
    userId: string,
    data: {
      ownerFullName: string;
      ownerPhone: string;
      ownerEmail: string;
      dateOfBirth?: string;
      residentialAddress?: string;
      idType: string;
      idNumber: string;
      idDocumentUrl: string;
    }
  ) {
    return this.prisma.merchantProfile.update({
      where: { userId },
      data: {
        ownerFullName: data.ownerFullName,
        ownerPhone: data.ownerPhone,
        ownerEmail: data.ownerEmail,
        dateOfBirth: data.dateOfBirth,
        residentialAddress: data.residentialAddress,
        idType: data.idType,
        idNumber: data.idNumber,
        idDocumentUrl: data.idDocumentUrl,
        onboardingStep: 4,
      },
    });
  }

  // Step 4 — Food Business Specifications & Operating Timelines
  async updateStep4(
    userId: string,
    data: {
      mainCategories: string[];
      avgPrepTimeMinutes: number;
      acceptsSameDay: boolean;
      acceptsScheduled: boolean;
      openingDays: string[];
      openingTime: string;
      closingTime: string;
      photos?: string[];
    }
  ) {
    return this.prisma.merchantProfile.update({
      where: { userId },
      data: {
        mainCategories: data.mainCategories,
        avgPrepTimeMinutes: data.avgPrepTimeMinutes,
        acceptsSameDay: data.acceptsSameDay,
        acceptsScheduled: data.acceptsScheduled,
        openingDays: data.openingDays,
        openingTime: data.openingTime,
        closingTime: data.closingTime,
        photos: data.photos,
        onboardingStep: 5,
      },
    });
  }

  // Step 5 — Payment & Settlement (Bank Account Linking)
  async updateStep5(
    userId: string,
    data: {
      accountNumber: string;
      accountName: string;
      bankName: string;
    }
  ) {
    const profile = await this.getProfile(userId);

    await this.prisma.bankAccount.upsert({
      where: { merchantId: profile.id },
      create: {
        merchantId: profile.id,
        accountNumber: data.accountNumber,
        accountName: data.accountName,
        bankName: data.bankName,
        isVerified: true,
      },
      update: {
        accountNumber: data.accountNumber,
        accountName: data.accountName,
        bankName: data.bankName,
        isVerified: true,
      },
    });

    return this.prisma.merchantProfile.update({
      where: { userId },
      data: { onboardingStep: 6 },
    });
  }

  // Step 6 — Verification, Optional CAC & Final Submission
  async updateStep6(
    userId: string,
    data: {
      hasCac: boolean;
      cacNumber?: string;
      cacCertificateUrl?: string;
      supportingDocUrl?: string;
      termsAccepted: boolean;
    }
  ) {
    if (!data || !data.termsAccepted) {
      throw new BadRequestException('You must accept the merchant terms and policies to submit your application.');
    }

    return this.prisma.merchantProfile.update({
      where: { userId },
      data: {
        hasCac: data.hasCac ?? false,
        cacNumber: data.cacNumber || null,
        cacCertificateUrl: data.cacCertificateUrl || null,
        supportingDocUrl: data.supportingDocUrl || null,
        termsAccepted: data.termsAccepted,
        kycStatus: 'PENDING',
        onboardingStep: 6,
        isOnboardingComplete: true,
      },
    });
  }
}