import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import * as bcrypt from "bcrypt";

import { PrismaService } from "../providers/database/prisma.service";
import { LandmarksService } from "../landmarks/landmarks.service";

import { UpdateProfileDto } from "./dto/update-profile.dto";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { UpdateDeliveryAddressDto } from "./dto/update-delivery-address.dto";
import { CreateAddressDto } from "./dto/create-address.dto";

@Injectable()
export class ProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly landmarksService: LandmarksService,
  ) {}

  async getProfile(customerId: string) {
    const customer = await this.prisma.user.findUnique({
      where: {
        id: customerId,
      },
      include: {
        landmark: true,
        savedAddresses: {
          where: {
            isDefault: true,
          },
          take: 1,
          select: {
            street: true,
            city: true,
            state: true,
            country: true,
          },
        },
      },
    });

    if (!customer) {
      throw new NotFoundException("Customer not found");
    }

    return {
      id: customer.id,
      firstName: customer.firstName,
      lastName: customer.lastName,
      email: customer.email,
      phoneNumber: customer.phoneNumber,
      avatarUrl: customer.avatarUrl,
      role: customer.role,
      status: customer.status,
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt,
      landmark: customer.landmark,
      address:
        customer.savedAddresses.length > 0
          ? customer.savedAddresses[0]
          : null,
    };
  }

  async updateProfile(
    customerId: string,
    dto: UpdateProfileDto,
  ) {
    const customer = await this.prisma.user.findUnique({
      where: {
        id: customerId,
      },
    });

    if (!customer) {
      throw new NotFoundException("Customer not found");
    }

    return this.prisma.user.update({
      where: {
        id: customerId,
      },
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        phoneNumber: dto.phoneNumber,
        avatarUrl: dto.avatarUrl,
      },
    });
  }

async updateDeliveryAddress(
    customerId: string,
    dto: UpdateDeliveryAddressDto,
  ) {
    const customer = await this.prisma.user.findUnique({
      where: { id: customerId },
    });

    if (!customer) {
      throw new NotFoundException("Customer not found");
    }

    const cityLandmarks = this.landmarksService.getLandmarksByCity("Osogbo");
    const matchedLandmark = cityLandmarks.find((l) => l.id === dto.landmarkId);

    if (!matchedLandmark) {
      throw new BadRequestException("Selected landmark is invalid or inactive.");
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: customerId },
      data: {
        landmarkId: matchedLandmark.id,
        city: matchedLandmark.city,
      },
      include: { landmark: true },
    });

    await this.prisma.savedAddress.updateMany({
      where: { userId: customerId },
      data: { isDefault: false },
    });

    await this.prisma.savedAddress.create({
      data: {
        userId: customerId,
        label: "Default Delivery Address",
        street: `${dto.streetAddress} near ${matchedLandmark.name}`,
        city: matchedLandmark.city,
        state: matchedLandmark.state,
        country: "Nigeria",
        latitude: matchedLandmark.latitude,
        longitude: matchedLandmark.longitude,
        isDefault: true,
      },
    });

    return {
      message: "Delivery address updated successfully.",
      user: updatedUser,
    };
  }


  async getUserAddresses(userId: string) {
    const addresses = await this.prisma.savedAddress.findMany({
      where: { userId },
      orderBy: { isDefault: 'desc' },
    });

    // Map cached landmarks using lat/lng or store relationship if mapped
    return addresses.map((addr) => {
      const cityLandmarks = this.landmarksService.getLandmarksByCity(addr.city);
      const landmark = cityLandmarks.find(
        (l) => l.latitude === addr.latitude && l.longitude === addr.longitude,
      );
      return {
        ...addr,
        landmark: landmark || null,
      };
    });
  }

  async addAddress(userId: string, dto: CreateAddressDto) {
    const cityLandmarks = this.landmarksService.getLandmarksByCity("Osogbo");
    const matchedLandmark = cityLandmarks.find((l) => l.id === dto.landmarkId);

    if (!matchedLandmark) {
      throw new BadRequestException('Selected landmark is invalid or inactive.');
    }

    const existingCount = await this.prisma.savedAddress.count({
      where: { userId },
    });

    const isDefault = existingCount === 0;

    if (isDefault) {
      await this.prisma.savedAddress.updateMany({
        where: { userId },
        data: { isDefault: false },
      });
    }

    return this.prisma.savedAddress.create({
      data: {
        userId,
        label: "Delivery Address",
        street: `${dto.streetAddress} near ${matchedLandmark.name}`,
        city: matchedLandmark.city,
        state: matchedLandmark.state,
        country: "Nigeria",
        latitude: matchedLandmark.latitude,
        longitude: matchedLandmark.longitude,
        isDefault,
      },
    });
  }

  async setDefaultAddress(userId: string, addressId: string) {
    const address = await this.prisma.savedAddress.findFirst({
      where: { id: addressId, userId },
    });

    if (!address) {
      throw new NotFoundException('Address not found.');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.savedAddress.updateMany({
        where: { userId },
        data: { isDefault: false },
      });

      return tx.savedAddress.update({
        where: { id: addressId },
        data: { isDefault: true },
      });
    });
  }



  async changePassword(
    customerId: string,
    dto: ChangePasswordDto,
  ) {
    const user = await this.prisma.user.findUnique({
      where: {
        id: customerId,
      },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    const passwordMatches = await bcrypt.compare(
      dto.currentPassword,
      user.passwordHash,
    );

    if (!passwordMatches) {
      throw new BadRequestException("Current password is incorrect.");
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);

    await this.prisma.user.update({
      where: {
        id: customerId,
      },
      data: {
        passwordHash: hashedPassword,
      },
    });

    return {
      message: "Password updated successfully.",
    };
  }
}