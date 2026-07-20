import { Injectable, ConflictException, BadRequestException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../providers/database/prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findByEmail(email: string) {
    // 🌟 Safety Guard: Return null immediately if string is missing, undefined, or empty
    if (!email) {
      return null;
    }
    return this.prisma.user.findUnique({ where: { email } });
  }

  async findByPhone(phoneNumber: string) {
    // 🌟 Safety Guard: Return null immediately if string is missing, undefined, or empty
    if (!phoneNumber) {
      return null;
    }
    return this.prisma.user.findUnique({ where: { phoneNumber } });
  }

  async createUser(data: {
    email: string;
    phoneNumber: string; 
    passwordRaw: string;
    firstName: string;
    lastName: string;
    role: UserRole;
  }) {
    // 🚨 Add a defensive check to capture missing passwords immediately
    if (!data.passwordRaw) {
      throw new BadRequestException('Password (passwordRaw) is required to create a user.');
    }

    const existingEmail = await this.findByEmail(data.email);
    if (existingEmail) throw new ConflictException('Email already registered');

    const existingPhone = await this.findByPhone(data.phoneNumber);
    if (existingPhone) throw new ConflictException('Phone number already registered');

    // Generate salt and hash safely
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(data.passwordRaw, salt);

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: data.email,
          phoneNumber: data.phoneNumber,
          passwordHash,
          firstName: data.firstName,
          lastName: data.lastName,
          role: data.role,
          status: data.role === 'CUSTOMER' ? 'VERIFIED' : 'PENDING_VERIFICATION',
        },
      });

      // Automatically assign an empty operational wallet to every user record
      await tx.wallet.create({
        data: {
          userId: user.id,
          availableBalance: 0.00,
          pendingBalance: 0.00,
        },
      });

      // If they are registering as a rider, spin up their baseline rider profile stub
      if (data.role === 'RIDER') {
        await tx.riderProfile.create({
          data: { userId: user.id },
        });
      }

      // If they are a vendor/business, spin up their operational business stub
      if (data.role === 'BUSINESS_OWNER') {
        await tx.businessProfile.create({
          data: {
            userId: user.id,
            businessName: `${data.firstName}'s Logistics Hub`,
          },
        });
      }

      return user;
    });
  }
}