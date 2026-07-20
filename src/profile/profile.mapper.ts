import { User } from "@prisma/client";

export class ProfileMapper {
  static toResponse(customer: User) {
    return {
      id: customer.id,

      firstName: customer.firstName,

      lastName: customer.lastName,

      fullName: `${customer.firstName} ${customer.lastName}`.trim(),

      email: customer.email,

      phone: customer.phoneNumber,

      avatar: customer.avatarUrl,

      role: customer.role,

      verificationStatus: customer.status
        ? "Verified"
        : "Pending",

      createdAt: customer.createdAt,

      updatedAt: customer.updatedAt,
    };
  }
}