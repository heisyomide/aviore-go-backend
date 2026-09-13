import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../providers/database/prisma.service';
import { KycStatus, IdentityStatus } from '@prisma/client';

@Injectable()
export class AdminMerchantService {
  constructor(private readonly prisma: PrismaService) {}
async getAllMerchants() {
    return (this.prisma as any).merchantProfile.findMany({
      include: {
        user: { select: { id: true, email: true, phoneNumber: true, status: true, role: true, createdAt: true } },
        operatingHours: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getMerchantById(merchantId: string) {
    const merchant = await (this.prisma as any).merchantProfile.findUnique({
      where: { id: merchantId },
      include: {
        user: { select: { id: true, email: true, phoneNumber: true, status: true, role: true, createdAt: true } },
        operatingHours: true,
        menuItems: { take: 5 },
      },
    });

    if (!merchant) throw new NotFoundException('Merchant profile not found');
    return merchant;
  }
  async updateMerchantStatus(merchantId: string, kycStatus: KycStatus) {
    const merchant = await (this.prisma as any).merchantProfile.findUnique({
      where: { id: merchantId },
      include: { user: true },
    });

    if (!merchant) throw new NotFoundException('Merchant profile not found');

    return this.prisma.$transaction(async (tx: any) => {
      let userStatus: IdentityStatus = IdentityStatus.PENDING_VERIFICATION;
      if (kycStatus === KycStatus.APPROVED) userStatus = IdentityStatus.VERIFIED;
      if (kycStatus === KycStatus.REJECTED) userStatus = IdentityStatus.REJECTED;

      await tx.user.update({
        where: { id: merchant.userId },
        data: { status: userStatus },
      });

      return tx.merchantProfile.update({
        where: { id: merchantId },
        data: { 
          kycStatus,
          isOpen: kycStatus === KycStatus.APPROVED,
        },
      });
    });
  }
}