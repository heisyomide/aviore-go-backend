import { Controller, Get, Patch, Param, Body, UseGuards, Req, Delete, Post, NotFoundException } from '@nestjs/common';
import { MerchantDashboardService } from './merchant-dashboard.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'; // Adjust path if needed
import { FlutterwaveService } from 'src/flutterwave/flutterwave.service';
import { PrismaService } from '../providers/database/prisma.service';
import { UseInterceptors, UploadedFiles } from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { CloudinaryService } from '../rider-onboarding/uploads/cloudinary.service';
import * as path from 'path';
import * as fs from 'fs';

@UseGuards(JwtAuthGuard)
@Controller('merchant/dashboard')
export class MerchantDashboardController {
  constructor(private readonly dashboardService: MerchantDashboardService, private readonly prisma: PrismaService, private readonly flutterwaveService: FlutterwaveService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  private getUserId(req: any): string {
    return req.user.sub || req.user.id;
  }

  @Get()
  getDashboardOverview(@Req() req) {
    return this.dashboardService.getDashboardOverview(this.getUserId(req));
  }

  @Patch('status')
  toggleStoreStatus(@Req() req, @Body('isOpen') isOpen: boolean) {
    return this.dashboardService.toggleStoreStatus(this.getUserId(req), isOpen);
  }

  @Patch('orders/:orderId/status')
  updateOrderStatus(
    @Req() req,
    @Param('orderId') orderId: string,
    @Body('status') status: any,
  ) {
    return this.dashboardService.updateOrderStatus(this.getUserId(req), orderId, status);
  }

  @Get('menu')
  getMenu(@Req() req) {
    return this.dashboardService.getMenu(this.getUserId(req));
  }

  @Post('menu')
  createMenuItem(@Req() req, @Body() dto: any) {
    return this.dashboardService.createMenuItem(this.getUserId(req), dto);
  }

  @Patch('menu/:id')
  updateMenuItem(@Req() req, @Param('id') id: string, @Body() dto: any) {
    return this.dashboardService.updateMenuItem(this.getUserId(req), id, dto);
  }

  @Delete('menu/:id')
  deleteMenuItem(@Req() req, @Param('id') id: string) {
    return this.dashboardService.deleteMenuItem(this.getUserId(req), id);
  }

  @Get('wallet')
  async getWallet(@Req() req: any) {
    const userId = req.user?.id || req.user?.userId;
    return this.flutterwaveService.getMerchantWalletSummary(userId);
  }

  @Get('transactions')
  async getTransactions(@Req() req: any) {
    const userId = req.user?.id || req.user?.userId;
    return this.flutterwaveService.getMerchantTransactions(userId);
  }
@Get('profile')
  async getProfile(@Req() req: any) {
    const userId = req?.user?.id || req?.user?.userId;
    
    if (!userId) {
      return {
        storeName: "My Restaurant",
        phone: "",
        address: "",
        latitude: null,
        longitude: null,
        description: "",
        logoUrl: "",
        coverUrl: "",
        storeSlug: "store",
        restaurantId: "AVG-1025",
        storeUrl: "https://aviorego.com.ng/store",
      };
    }

    const profile = await this.prisma.merchantProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      throw new NotFoundException('MERCHANT_PROFILE_NOT_FOUND');
    }

    return {
      storeName: profile.businessName,
      phone: profile.phone,
      address: profile.address,
      latitude: profile.latitude,
      longitude: profile.longitude,
      description: profile.description,
      logoUrl: profile.logoUrl,
      coverUrl: profile.coverUrl,
      storeSlug: 'store',
      restaurantId: profile.id ? `AVG-${profile.id.slice(0, 4)}` : 'AVG-1025',
      storeUrl: 'https://aviorego.com.ng/store',
    };
  }

 @Patch('profile')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'logo', maxCount: 1 },
      { name: 'cover', maxCount: 1 },
    ]),
  )
  async updateProfile(
    @Req() req: any, 
    @Body() body: any,
    @UploadedFiles() files?: { logo?: Express.Multer.File[]; cover?: Express.Multer.File[] },
  ) {
    const userId = req?.user?.id || req?.user?.userId;
    if (!userId) {
      return { success: false, message: "Unauthorized" };
    }

    const existingProfile = await this.prisma.merchantProfile.findUnique({
      where: { userId },
    });

    const logoFile = files?.logo?.[0];
    const coverFile = files?.cover?.[0];

    const cleanUrl = (val: string | null | undefined) => {
      if (!val || val === 'undefined' || val === 'null' || val.trim() === '') return null;
      return val;
    };

    let logoUrl = cleanUrl(existingProfile?.logoUrl);
    let coverUrl = cleanUrl(existingProfile?.coverUrl);

    if (logoFile) {
      const uploadResult: any = await this.cloudinaryService.uploadFile(logoFile, 'merchant-profiles');
      logoUrl = uploadResult?.secure_url;
    }

    if (coverFile) {
      const uploadResult: any = await this.cloudinaryService.uploadFile(coverFile, 'merchant-profiles');
      coverUrl = uploadResult?.secure_url;
    }

    // Resolve landmark coordinates if a landmarkId is passed from the modal
    let latitude = existingProfile?.latitude;
    let longitude = existingProfile?.longitude;

    if (body.landmarkId) {
      const landmark = await this.prisma.landmark.findUnique({
        where: { id: body.landmarkId },
      });
      if (landmark) {
        latitude = landmark.latitude;
        longitude = landmark.longitude;
      }
    }

    const updatedProfile = await this.prisma.merchantProfile.upsert({
      where: { userId },
      update: {
        businessName: body.storeName,
        phone: body.phone,
        address: body.streetAddress || body.address,
        landmarkId: body.landmarkId || undefined,
        ...(latitude !== null && latitude !== undefined && { latitude }),
        ...(longitude !== null && longitude !== undefined && { longitude }),
        description: body.description,
        logoUrl: logoUrl || "",
        coverUrl: coverUrl || "",
      },
      create: {
        userId,
        businessName: body.storeName,
        phone: body.phone,
        address: body.streetAddress || body.address,
        landmarkId: body.landmarkId || undefined,
        latitude: latitude || null,
        longitude: longitude || null,
        description: body.description,
        logoUrl: logoUrl || "",
        coverUrl: coverUrl || "",
      },
    });

    const slug = updatedProfile.id.substring(0, 8).toLowerCase();

    return { 
      success: true, 
      storeName: updatedProfile.businessName,
      phone: updatedProfile.phone,
      address: updatedProfile.address,
      latitude: updatedProfile.latitude,
      longitude: updatedProfile.longitude,
      description: updatedProfile.description,
      logoUrl: updatedProfile.logoUrl || "",
      coverUrl: updatedProfile.coverUrl || "",
      storeSlug: slug,
      storeUrl: `https://aviorego.com.ng/${slug}`
    };
  }

  @Get('hours')
  async getHours(@Req() req: any) {
    const userId = req.user?.id || req.user?.sub;
    
    // Find the merchant profile linked to the user
    const merchant = await this.prisma.merchantProfile.findUnique({
      where: { userId },
      include: { operatingHours: true },
    });

    if (!merchant) {
      throw new NotFoundException('Merchant profile not found');
    }

    // Map Prisma database format to the frontend schedule format
    const daysOrder = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    
    const schedule = daysOrder.map((day) => {
      const found = merchant.operatingHours.find(
        (h) => h.dayOfWeek.toLowerCase() === day.toLowerCase()
      );
      return {
        day,
        open: found?.openingTime || "08:00 AM",
        close: found?.closingTime || "09:00 PM",
        active: found ? !found.isClosed : true,
      };
    });

    return { schedule };
  }

 @Patch('hours')
  async updateHours(@Req() req: any, @Body() body: { schedule: any[] }) {
    const userId = req.user?.id || req.user?.sub;

    const merchant = await this.prisma.merchantProfile.findUnique({
      where: { userId },
    });

    if (!merchant) {
      throw new NotFoundException('Merchant profile not found');
    }

    // Cleanly delete existing hours for this merchant and insert the new array fresh
    await this.prisma.operatingHours.deleteMany({
      where: { merchantId: merchant.id },
    });

    const hoursToCreate = body.schedule.map((item) => ({
      merchantId: merchant.id,
      dayOfWeek: item.day.toUpperCase(),
      openingTime: item.open,
      closingTime: item.close,
      isClosed: !item.active,
    }));

    await this.prisma.operatingHours.createMany({
      data: hoursToCreate,
    });

    return { success: true, message: "Operating hours updated successfully" };
  }

  @Get('delivery-settings')
  async getDeliverySettings(@Req() req: any) {
    const userId = req.user?.id || req.user?.sub;

    const merchant = await this.prisma.merchantProfile.findUnique({
      where: { userId },
    });

    if (!merchant) {
      throw new NotFoundException('Merchant profile not found');
    }

    return {
      settings: {
        prepBuffer: (merchant as any).prepBuffer || 20,
        deliveryMode: (merchant as any).deliveryMode || "aviorgo",
      },
    };
  }

  @Patch('delivery-settings')
  async updateDeliverySettings(@Req() req: any, @Body() body: { prepBuffer: number; deliveryMode: string }) {
    const userId = req.user?.id || req.user?.sub;

    const merchant = await this.prisma.merchantProfile.findUnique({
      where: { userId },
    });

    if (!merchant) {
      throw new NotFoundException('Merchant profile not found');
    }

    await this.prisma.merchantProfile.update({
      where: { id: merchant.id },
      data: {
        // If these fields are not yet in your Prisma schema, add them or store them as part of your settings model
        prepBuffer: body.prepBuffer,
        deliveryMode: body.deliveryMode,
      } as any,
    });

    return { success: true, message: "Delivery settings updated successfully" };
  }

  @Get('bank-account')
  async getBankAccount(@Req() req: any) {
    const userId = req.user?.id || req.user?.sub;

    const merchant = await this.prisma.merchantProfile.findUnique({
      where: { userId },
    });

    if (!merchant) {
      throw new NotFoundException('Merchant profile not found');
    }

    return {
      bankAccount: {
        bankCode: (merchant as any).bankCode || "",
        accountNumber: (merchant as any).accountNumber || "",
        accountName: (merchant as any).accountName || "",
      },
    };
  }
@Patch('bank-account')
  async updateBankAccount(
    @Req() req: any, 
    @Body() body: { bankCode: string; accountNumber: string; accountName: string }
  ) {
    const userId = req.user?.id || req.user?.sub;

    const merchant = await this.prisma.merchantProfile.findUnique({
      where: { userId },
    });

    if (!merchant) {
      throw new NotFoundException('Merchant profile not found');
    }

    // Directly upsert into the BankAccount table using merchantId
    await this.prisma.bankAccount.upsert({
      where: { merchantId: merchant.id },
      create: {
        merchantId: merchant.id,
        bankCode: body.bankCode,
        accountNumber: body.accountNumber,
        accountName: body.accountName,
        bankName: body.bankCode, // or map a human-readable bank name if available
        isVerified: true,
      },
      update: {
        bankCode: body.bankCode,
        accountNumber: body.accountNumber,
        accountName: body.accountName,
        bankName: body.bankCode,
        isVerified: true,
      },
    });

    return { success: true, message: "Bank account updated successfully" };
  }

  @Get('notifications-settings')
async getNotificationSettings(@Req() req: any) {
  const userId = req.user?.id || req.user?.sub;
  return this.dashboardService.getNotificationSettings(userId);
}

@Patch('notifications-settings')
async updateNotificationSettings(@Req() req: any, @Body() body: any) {
  const userId = req.user?.id || req.user?.sub;
  return this.dashboardService.updateNotificationSettings(userId, body);
}

@Get('reviews')
async getMerchantReviews(@Req() req: any) {
  const userId = req.user?.id || req.user?.sub;
  return this.dashboardService.getReviews(userId);
}
}