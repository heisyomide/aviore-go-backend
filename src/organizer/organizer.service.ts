import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../providers/database/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { NotificationType } from '../notification/dto/send-notification.dto';
import { CreateOrganizerProfileDto } from './dto/create-organizer-profile.dto';

@Injectable()
export class OrganizerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
  ) {}

  async createProfile(userId: string, dto: CreateOrganizerProfileDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User account not found.');
    }

    const organizerProfile = await this.prisma.eventOrganizerProfile.upsert({
      where: { userId: userId },
      update: {
        organizationName: dto.organizationName,
        category: dto.category,
        city: dto.city,
        instagramHandle: dto.instagramHandle,
        supportEmail: dto.supportEmail,
        supportPhone: dto.supportPhone,
        logoUrl: dto.logoUrl,
      },
      create: {
        userId: userId,
        organizationName: dto.organizationName,
        category: dto.category,
        city: dto.city,
        instagramHandle: dto.instagramHandle,
        supportEmail: dto.supportEmail,
        supportPhone: dto.supportPhone,
        logoUrl: dto.logoUrl,
      },
    });

    // Update user phone if provided
    if (dto.supportPhone) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { phoneNumber: dto.supportPhone },
      });
    }

    // Send welcome email notification
    const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Organizer';
    
    await this.notificationService.dispatch({
      type: NotificationType.ACCOUNT_WELCOME,
      userId: user.id,
      email: user.email,
      title: `Welcome as an Organizer, ${fullName}! 🚀`,
      body: `Hello ${fullName}, I am delighted to welcome you to Aviorè. Your organization profile for "${dto.organizationName}" has been successfully created. You can now begin publishing events, managing ticket sales, and coordinating transit corridors.`,
    });

    return {
      message: 'Organizer profile created successfully!',
      profile: organizerProfile,
    };
  }
}