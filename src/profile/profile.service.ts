import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import * as bcrypt from "bcrypt";

import { PrismaService } from "../providers/database/prisma.service";

import { UpdateProfileDto } from "./dto/update-profile.dto";
import { ChangePasswordDto } from "./dto/change-password.dto";

@Injectable()
export class ProfileService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

 async getProfile(customerId: string) {
  const customer = await this.prisma.user.findUnique({
    where: {
      id: customerId,
    },

    include: {
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
    throw new NotFoundException(
      "Customer not found",
    );
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
    const customer =
      await this.prisma.user.findUnique({
        where: {
          id: customerId,
        },
      });

    if (!customer) {
      throw new NotFoundException(
        "Customer not found",
      );
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
    throw new BadRequestException(
      "Current password is incorrect.",
    );
  }

  const hashedPassword = await bcrypt.hash(
    dto.newPassword,
    10,
  );

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