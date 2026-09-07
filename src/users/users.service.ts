import { Injectable, ConflictException, BadRequestException } from '@nestjs/common';
import { UserRole, MerchantType } from '@prisma/client';
import { PrismaService } from '../providers/database/prisma.service';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findByEmail(email: string) {
    if (!email) {
      return null;
    }
    return this.prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  }

  async findByPhone(phoneNumber: string) {
    if (!phoneNumber || phoneNumber.startsWith('PENDING_')) {
      return null;
    }
    return this.prisma.user.findUnique({ where: { phoneNumber } });
  }

  async createUser(data: {
    email: string;
    phoneNumber?: string; 
    passwordRaw: string;
    firstName?: string;
    lastName?: string;
    role: UserRole;
    merchantType?: string;
  }) {
    if (!data.passwordRaw) {
      throw new BadRequestException('Password (passwordRaw) is required to create a user.');
    }

    const emailFormatted = data.email.toLowerCase().trim();
    const emailToken = crypto.randomUUID();

    const existingEmail = await this.findByEmail(emailFormatted);
    if (existingEmail) throw new ConflictException('Email already registered');

    const cleanPhone =
      data.phoneNumber && data.phoneNumber.trim().length > 0
        ? data.phoneNumber.trim()
        : `PENDING_${emailToken}`;

    if (!cleanPhone.startsWith('PENDING_')) {
      const existingPhone = await this.findByPhone(cleanPhone);
      if (existingPhone) throw new ConflictException('Phone number already registered');
    }

    const cleanFirstName = data.firstName?.trim() || '';
    const cleanLastName = data.lastName?.trim() || '';

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(data.passwordRaw, salt);

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: emailFormatted,
          phoneNumber: cleanPhone,
          passwordHash,
          firstName: cleanFirstName,
          lastName: cleanLastName,
          role: data.role,
          status: data.role === 'CUSTOMER' ? 'VERIFIED' : 'PENDING_VERIFICATION',
          emailVerificationToken: data.role !== 'CUSTOMER' ? emailToken : null,
        },
      });

      await tx.wallet.create({
        data: {
          userId: user.id,
          availableBalance: 0.00,
          pendingBalance: 0.00,
        },
      });

      if (data.role === 'RIDER') {
        await tx.riderProfile.create({
          data: { userId: user.id },
        });
      }

      if (data.role === 'MERCHANT') {
        const resolvedMerchantType = (data.merchantType as MerchantType) || MerchantType.FOOD;
        await tx.merchantProfile.create({
          data: {
            userId: user.id,
            businessName: `${cleanFirstName || 'My'} Store`,
            merchantType: resolvedMerchantType,
          },
        });
      }

      return user;
    });
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
        phoneNumber: true,
      },
    });
  }
}