import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Param,
  Patch,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { LandmarksService } from './landmarks.service';
import { GetLandmarksQueryDto } from './dto/get-landmarks.dto';
import { CreateLandmarkDto } from './dto/create-landmarks.dto';

@Controller('landmarks')
export class LandmarksController {
  constructor(private readonly landmarksService: LandmarksService) {}

  /**
   * Public Endpoint: Download city landmarks list once.
   * GET /landmarks?city=Osogbo
   * Zero DB Hit (served straight from NestJS RAM).
   */
  @Get()
  getLandmarks(@Query() query: GetLandmarksQueryDto) {
    return this.landmarksService.getLandmarksByCity(query.city || 'Osogbo');
  }

  /**
   * Admin / Internal Endpoint: Trigger manual RAM cache refresh.
   * POST /landmarks/refresh
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refreshCache() {
    await this.landmarksService.refreshCache();
    return { success: true, message: 'Landmarks cache refreshed successfully' };
  }

  /**
   * Admin Endpoint: Add new landmark manually.
   * POST /landmarks
   */
  @Post()
  async createLandmark(@Body() dto: CreateLandmarkDto) {
    return this.landmarksService.create(dto);
  }

  /**
   * Admin Endpoint: Enable or Disable a landmark.
   * PATCH /landmarks/:id/toggle
   */
  @Patch(':id/toggle')
  async toggleLandmark(
    @Param('id') id: string,
    @Body('isActive') isActive: boolean,
  ) {
    return this.landmarksService.toggleActive(id, isActive);
  }

  @Get('search')
  searchLandmarks(
    @Query('city') city: string,
    @Query('query') query: string,
  ) {
    // Queries in-memory RAM cache
    return this.landmarksService.searchInRamCache(city, query);
  }

}