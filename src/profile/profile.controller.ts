import {
  Body,
  Controller,
  Get,
  Patch,
  UseGuards,
} from "@nestjs/common";

import { ProfileService } from "./profile.service";

import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";

import { GetUser } from "../auth/decorators/get-user.decorator";

import { UpdateProfileDto } from "./dto/update-profile.dto";
import { ChangePasswordDto } from "./dto/change-password.dto";

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
}