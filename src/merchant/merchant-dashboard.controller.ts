import { Controller, Get, Patch, Param, Body, UseGuards, Req, Delete, Post, NotFoundException, UploadedFile, UseInterceptors, UploadedFiles } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MerchantDashboardService } from './merchant-dashboard.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FlutterwaveService } from 'src/flutterwave/flutterwave.service';
import { PrismaService } from '../providers/database/prisma.service';
import { CloudinaryService } from '../rider-onboarding/uploads/cloudinary.service';
import { FileFieldsInterceptor } from '@nestjs/platform-express';

@UseGuards(JwtAuthGuard)
@Controller('merchant/dashboard')
export class MerchantDashboardController {
  constructor(
    private readonly dashboardService: MerchantDashboardService,
    private readonly prisma: PrismaService,
    private readonly flutterwaveService: FlutterwaveService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  private getUserId(req: any): string {
    return req.user?.sub || req.user?.id || req.user?.userId;
  }

  // ==================== DASHBOARD & STORE ====================

  @Get()
  getDashboardOverview(@Req() req: any) {
    return this.dashboardService.getDashboardOverview(this.getUserId(req));
  }

  @Patch('status')
  toggleStoreStatus(@Req() req: any, @Body('isOpen') isOpen: boolean) {
    return this.dashboardService.toggleStoreStatus(this.getUserId(req), isOpen);
  }

  // ==================== ORDERS ====================

  @Patch('orders/:orderId/status')
  updateOrderStatus(
    @Req() req: any,
    @Param('orderId') orderId: string,
    @Body('status') status: any,
  ) {
    return this.dashboardService.updateOrderStatus(this.getUserId(req), orderId, status);
  }

  // ==================== MENU ====================

  @Get('menu')
  getMenu(@Req() req: any) {
    return this.dashboardService.getMenu(this.getUserId(req));
  }

  @Post('menu')
  @UseInterceptors(FileInterceptor('file'))
  async createMenuItem(
    @Req() req: any,
    @Body() dto: any,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    let imageUrl = dto.imageUrl || '';

    if (file) {
      const uploadResult: any = await this.cloudinaryService.uploadFile(file, 'merchant-menu');
      imageUrl = uploadResult?.secure_url;
    }

    const payload = {
      ...dto,
      price: parseFloat(dto.price),
      available: dto.available === 'true' || dto.available === true,
      imageUrl,
    };

    return this.dashboardService.createMenuItem(this.getUserId(req), payload);
  }

  @Patch('menu/:id')
  @UseInterceptors(FileInterceptor('file'))
  async updateMenuItem(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: any,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    let imageUrl = dto.imageUrl;

    if (file) {
      const uploadResult: any = await this.cloudinaryService.uploadFile(file, 'merchant-menu');
      imageUrl = uploadResult?.secure_url;
    }

    const payload = {
      ...dto,
      ...(dto.price !== undefined && { price: parseFloat(dto.price) }),
      ...(dto.available !== undefined && { available: dto.available === 'true' || dto.available === true }),
      ...(imageUrl !== undefined && { imageUrl }),
    };

    return this.dashboardService.updateMenuItem(this.getUserId(req), id, payload);
  }

  @Delete('menu/:id')
  deleteMenuItem(@Req() req: any, @Param('id') id: string) {
    return this.dashboardService.deleteMenuItem(this.getUserId(req), id);
  }

  // ==================== WALLET & TRANSACTIONS ====================

  @Get('wallet')
  async getWallet(@Req() req: any) {
    return this.flutterwaveService.getMerchantWalletSummary(this.getUserId(req));
  }

  @Get('transactions')
  async getTransactions(@Req() req: any) {
    return this.flutterwaveService.getMerchantTransactions(this.getUserId(req));
  }

  // ==================== PROFILE ====================

  @Get('profile')
  async getProfile(@Req() req: any) {
    const userId = this.getUserId(req);

    if (!userId) {
      return this.getDefaultProfileResponse();
    }

    const profile = await this.prisma.merchantProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      throw new NotFoundException('MERCHANT_PROFILE_NOT_FOUND');
    }

    const slug = profile.id ? profile.id.substring(0, 8).toLowerCase() : 'store';

    return {
      storeName: profile.businessName,
      phone: profile.phone,
      address: profile.address,
      latitude: profile.latitude,
      longitude: profile.longitude,
      description: profile.description,
      logoUrl: profile.logoUrl,
      coverUrl: profile.coverUrl,
      storeSlug: slug,
      restaurantId: profile.id ? `AVG-${profile.id.slice(0, 4)}` : 'AVG-1025',
      storeUrl: `https://aviorego.com.ng/${slug}`,
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
    const userId = this.getUserId(req);
    if (!userId) {
      return { success: false, message: 'Unauthorized' };
    }

    const existingProfile = await this.prisma.merchantProfile.findUnique({
      where: { userId },
    });

    const cleanUrl = (val: string | null | undefined) => {
      if (!val || val === 'undefined' || val === 'null' || val.trim() === '') return null;
      return val;
    };

    let logoUrl = cleanUrl(existingProfile?.logoUrl);
    let coverUrl = cleanUrl(existingProfile?.coverUrl);

    if (files?.logo?.[0]) {
      const uploadResult: any = await this.cloudinaryService.uploadFile(files.logo[0], 'merchant-profiles');
      logoUrl = uploadResult?.secure_url;
    }

    if (files?.cover?.[0]) {
      const uploadResult: any = await this.cloudinaryService.uploadFile(files.cover[0], 'merchant-profiles');
      coverUrl = uploadResult?.secure_url;
    }

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
        logoUrl: logoUrl || '',
        coverUrl: coverUrl || '',
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
        logoUrl: logoUrl || '',
        coverUrl: coverUrl || '',
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
      logoUrl: updatedProfile.logoUrl || '',
      coverUrl: updatedProfile.coverUrl || '',
      storeSlug: slug,
      storeUrl: `https://aviorego.com.ng/${slug}`,
    };
  }

  // ==================== OPERATING HOURS ====================

  @Get('hours')
  async getHours(@Req() req: any) {
    const merchant = await this.findMerchantOrThrow(this.getUserId(req));

    const daysOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

    const schedule = daysOrder.map((day) => {
      const found = merchant.operatingHours?.find(
        (h) => h.dayOfWeek.toLowerCase() === day.toLowerCase(),
      );
      return {
        day,
        open: found?.openingTime || '08:00 AM',
        close: found?.closingTime || '09:00 PM',
        active: found ? !found.isClosed : true,
      };
    });

    return { schedule };
  }

  @Patch('hours')
  async updateHours(@Req() req: any, @Body() body: { schedule: any[] }) {
    const merchant = await this.findMerchantOrThrow(this.getUserId(req));

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

    return { success: true, message: 'Operating hours updated successfully' };
  }

  // ==================== DELIVERY SETTINGS ====================

  @Get('delivery-settings')
  async getDeliverySettings(@Req() req: any) {
    const merchant = await this.findMerchantOrThrow(this.getUserId(req));

    return {
      settings: {
        prepBuffer: (merchant as any).prepBuffer || 20,
        deliveryMode: (merchant as any).deliveryMode || 'aviorgo',
      },
    };
  }

  @Patch('delivery-settings')
  async updateDeliverySettings(@Req() req: any, @Body() body: { prepBuffer: number; deliveryMode: string }) {
    const merchant = await this.findMerchantOrThrow(this.getUserId(req));

    await this.prisma.merchantProfile.update({
      where: { id: merchant.id },
      data: {
        prepBuffer: body.prepBuffer,
        deliveryMode: body.deliveryMode,
      } as any,
    });

    return { success: true, message: 'Delivery settings updated successfully' };
  }

  // ==================== BANK ACCOUNT & FINANCIALS ====================

  @Get('bank-account')
  async getBankAccount(@Req() req: any) {
    const merchant = await this.findMerchantOrThrow(this.getUserId(req));

    return {
      bankAccount: {
        bankCode: (merchant as any).bankCode || '',
        accountNumber: (merchant as any).accountNumber || '',
        accountName: (merchant as any).accountName || '',
      },
    };
  }

  @Patch('bank-account')
  async updateBankAccount(
    @Req() req: any,
    @Body() body: { bankCode: string; accountNumber: string; accountName: string },
  ) {
    const merchant = await this.findMerchantOrThrow(this.getUserId(req));

    await this.prisma.bankAccount.upsert({
      where: { merchantId: merchant.id },
      create: {
        merchantId: merchant.id,
        bankCode: body.bankCode,
        accountNumber: body.accountNumber,
        accountName: body.accountName,
        bankName: body.bankCode,
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

    return { success: true, message: 'Bank account updated successfully' };
  }

  @Get('account')
  async getAccount(@Req() req: any) {
    const merchant = await this.prisma.merchantProfile.findUnique({
      where: { userId: this.getUserId(req) },
      include: { bankAccount: true },
    });

    if (!merchant) {
      throw new NotFoundException('Merchant profile not found');
    }

    return { bankAccount: merchant.bankAccount || null };
  }

  // ==================== NOTIFICATIONS & REVIEWS ====================

  @Get('notifications-settings')
  async getNotificationSettings(@Req() req: any) {
    return this.dashboardService.getNotificationSettings(this.getUserId(req));
  }

  @Patch('notifications-settings')
  async updateNotificationSettings(@Req() req: any, @Body() body: any) {
    return this.dashboardService.updateNotificationSettings(this.getUserId(req), body);
  }

  @Get('reviews')
  async getMerchantReviews(@Req() req: any) {
    return this.dashboardService.getReviews(this.getUserId(req));
  }

  // ==================== PRIVATE HELPERS ====================

  private async findMerchantOrThrow(userId: string) {
    const merchant = await this.prisma.merchantProfile.findUnique({
      where: { userId },
      include: { operatingHours: true, bankAccount: true },
    });

    if (!merchant) {
      throw new NotFoundException('Merchant profile not found');
    }
    return merchant;
  }

  private getDefaultProfileResponse() {
    return {
      storeName: 'My Restaurant',
      phone: '',
      address: '',
      latitude: null,
      longitude: null,
      description: '',
      logoUrl: '',
      coverUrl: '',
      storeSlug: 'store',
      restaurantId: 'AVG-1025',
      storeUrl: 'https://aviorego.com.ng/store',
    };
  }
}