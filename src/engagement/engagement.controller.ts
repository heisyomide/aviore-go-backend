import { Controller, Get, Post, Body, Param, Patch, InternalServerErrorException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../providers/database/prisma.service';
import { CampaignCategory, CampaignFrequency } from '@prisma/client';
import { IsString, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';

class CreateCampaignDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  body!: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsString()
  @IsOptional()
  audience?: string;

  @IsString()
  @IsNotEmpty()
  startDate!: string;

  @IsString()
  @IsOptional()
  endDate?: string;

  @IsString()
  @IsNotEmpty()
  scheduledTime!: string;

  @IsString()
  @IsOptional()
  frequency?: string;
}

@Controller('admin/campaigns')
export class EngagementController {
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  async createCampaign(@Body() dto: CreateCampaignDto) {
    try {
      const category = Object.values(CampaignCategory).includes(dto.category as CampaignCategory)
        ? (dto.category as CampaignCategory)
        : CampaignCategory.GENERAL_BRAND;

      const frequency = Object.values(CampaignFrequency).includes(dto.frequency as CampaignFrequency)
        ? (dto.frequency as CampaignFrequency)
        : CampaignFrequency.DAILY;

      return await this.prisma.notificationCampaign.create({
        data: {
          title: dto.title,
          body: dto.body,
          category,
          audience: dto.audience || 'ALL',
          startDate: new Date(dto.startDate),
          endDate: dto.endDate ? new Date(dto.endDate) : null,
          scheduledTime: dto.scheduledTime,
          frequency,
        },
      });
    } catch (error: any) {
      console.error('[CREATE_CAMPAIGN_ERROR]', error);
      throw new BadRequestException(error.message || 'Failed to create notification campaign.');
    }
  }

  @Get()
  async listCampaigns() {
    try {
      return await this.prisma.notificationCampaign.findMany({
        orderBy: { createdAt: 'desc' },
      });
    } catch (error: any) {
      console.error('[LIST_CAMPAIGNS_ERROR]', error);
      throw new InternalServerErrorException(error.message || 'Database error while fetching campaigns.');
    }
  }

  @Patch(':id/toggle')
  async toggleCampaign(@Param('id') id: string) {
    try {
      const campaign = await this.prisma.notificationCampaign.findUnique({ where: { id } });
      if (!campaign) throw new NotFoundException('Campaign not found');

      return await this.prisma.notificationCampaign.update({
        where: { id },
        data: { isActive: !campaign.isActive },
      });
    } catch (error: any) {
      if (error instanceof NotFoundException) throw error;
      console.error('[TOGGLE_CAMPAIGN_ERROR]', error);
      throw new InternalServerErrorException(error.message || 'Failed to toggle campaign status.');
    }
  }
}