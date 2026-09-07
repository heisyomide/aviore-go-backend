import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../providers/database/prisma.service';

@Injectable()
export class MerchantService {
  constructor(private prisma: PrismaService) {}

  async getProfile(userId: string) {
    const profile = await this.prisma.merchantProfile.findUnique({
      where: { userId },
      include: { operatingHours: true, bankAccount: true, menuItems: true },
    });
    if (!profile) throw new NotFoundException('Merchant profile not found.');
    return profile;
  }

async updateStep1(userId: string, data: { businessName: string; description: string; cuisineType: string; phone: string }) {
    return this.prisma.merchantProfile.upsert({
      where: { userId },
      create: {
        userId,
        ...data,
        merchantType: 'FOOD',
        onboardingStep: 2,
        isOnboardingComplete: false,
      },
      update: {
        ...data,
        onboardingStep: 2,
      },
    });
  }

  async updateStep2(userId: string, data: { address: string; latitude: number; longitude: number }) {
    return this.prisma.merchantProfile.update({
      where: { userId },
      data: { ...data, onboardingStep: 3 },
    });
  }

  async updateStep3(userId: string, hours: { dayOfWeek: string; openingTime: string; closingTime: string; isClosed: boolean }[]) {
    const profile = await this.getProfile(userId);
    await this.prisma.operatingHours.deleteMany({ where: { merchantId: profile.id } });

    return this.prisma.merchantProfile.update({
      where: { userId },
      data: {
        onboardingStep: 4,
        operatingHours: {
          create: hours,
        },
      },
      include: { operatingHours: true },
    });
  }

  async updateStep4(userId: string, data: { logoUrl?: string; coverUrl?: string; photos?: string[] }) {
    return this.prisma.merchantProfile.update({
      where: { userId },
      data: { ...data, onboardingStep: 5 },
    });
  }

  async updateStep5(userId: string, data: { accountNumber: string; accountName: string; bankName: string }) {
    const profile = await this.getProfile(userId);
    await this.prisma.bankAccount.upsert({
      where: { merchantId: profile.id },
      create: { ...data, merchantId: profile.id, isVerified: true },
      update: data,
    });

    return this.prisma.merchantProfile.update({
      where: { userId },
      data: { onboardingStep: 6 },
    });
  }

  async updateStep6(userId: string, data?: { name: string; description?: string; price: number; category: string; imageUrl?: string; prepTimeMinutes?: number }) {
    const profile = await this.getProfile(userId);
    
    if (data) {
      await this.prisma.foodItem.create({
        data: { ...data, merchantId: profile.id },
      });
    }

    return this.prisma.merchantProfile.update({
      where: { userId },
      data: { isOnboardingComplete: true },
    });
  }
}