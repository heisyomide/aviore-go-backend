import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";

import { ProfileService } from "./profile.service";

import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";

import { GetUser } from "../auth/decorators/get-user.decorator";

import { UpdateProfileDto } from "./dto/update-profile.dto";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { UpdateDeliveryAddressDto } from "./dto/update-delivery-address.dto";
import { CreateAddressDto } from "./dto/create-address.dto";

@Controller("profile")
@UseGuards(JwtAuthGuard)
export class ProfileController {
  constructor(
    private readonly profileService: ProfileService,
  ) {}

  @Get()
  getProfile(
    @GetUser() user: any,
  ) {
    return this.profileService.getProfile(
     user.userId,
    );
  }

  @Patch()
  updateProfile(
    @GetUser() user: any,

    @Body()
    dto: UpdateProfileDto,
  ) {
    return this.profileService.updateProfile(
      user.userId,
      dto,
    );
  }

  @Patch("password")
  changePassword(
    @GetUser() user: any,

    @Body()
    dto: ChangePasswordDto,
  ) {
    return this.profileService.changePassword(
     user.userId,
      dto,
    );
  }

  @Patch('address')
  async updateDeliveryAddress(
    @Req() req: any, // or use your custom @CurrentUser() decorator
    @Body() dto: UpdateDeliveryAddressDto,
  ) {
    const customerId = req.user.id || req.user.userId;
    return this.profileService.updateDeliveryAddress(customerId, dto);
  }

  @Get('addresses')
  async getUserAddresses(@Req() req: any) {
    const userId = req.user.id || req.user.userId;
    return this.profileService.getUserAddresses(userId);
  }

  @Post('addresses')
  async addAddress(@Req() req: any, @Body() dto: CreateAddressDto) {
    const userId = req.user.id || req.user.userId;
    return this.profileService.addAddress(userId, dto);
  }

  @Patch('addresses/:id/default')
  async setDefaultAddress(@Req() req: any, @Param('id') addressId: string) {
    const userId = req.user.id || req.user.userId;
    return this.profileService.setDefaultAddress(userId, addressId);
  }

}