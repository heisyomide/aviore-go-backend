import { Controller, Post, Body, UnauthorizedException, HttpCode, HttpStatus, BadRequestException, Query, Get, UseGuards, Req } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from './guards/jwt-auth.guard'; // 👈 Ensure path matches your JwtAuthGuard

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private usersService: UsersService,
  ) {}

  // 🌟 REQUIRED FOR FRONTEND SECURITY GUARD
  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getProfile(@Req() req) {
    // req.user contains the decoded JWT token payload from JwtStrategy
    const user = await this.usersService.findById(req.user.sub || req.user.id);
    if (!user) {
      throw new UnauthorizedException('User account not found.');
    }
    return user;
  }

  @Post('register')
  async register(
    @Body()
    body: {
      email: string;
      phoneNumber: string;
      password?: string;
      passwordRaw?: string;
      firstName: string;
      lastName: string;
      role: UserRole;
    },
  ) {
    const {
      password,
      passwordRaw,
      email,
      phoneNumber,
      firstName,
      lastName,
      role,
    } = body;

    const user = await this.usersService.createUser({
      email,
      phoneNumber,
      firstName,
      lastName,
      role,
      passwordRaw: password ?? passwordRaw ?? '',
    });

    return this.authService.login(user);
  }

  @Post('register/rider')
  async registerRider(
    @Body() body: { email: string; password?: string; passwordRaw?: string },
  ) {
    const password = body.password ?? body.passwordRaw ?? '';
    return this.authService.registerRider({ email: body.email, password });
  }

  @Post('register/organizer')
  async registerOrganizer(
    @Body() body: { email: string; password?: string; passwordRaw?: string; firstName?: string; lastName?: string; phoneNumber?: string },
  ) {
    const password = body.password ?? body.passwordRaw ?? '';
    return this.authService.registerOrganizer({
      email: body.email,
      password,
      firstName: body.firstName,
      lastName: body.lastName,
      phoneNumber: body.phoneNumber,
    });
  }

  @Post('register/merchant')
  async registerMerchant(
    @Body() body: { email: string; password?: string; passwordRaw?: string; firstName?: string; lastName?: string; phoneNumber?: string },
  ) {
    const password = body.password ?? body.passwordRaw ?? '';
    return this.authService.registerMerchant({
      email: body.email,
      password,
      firstName: body.firstName,
      lastName: body.lastName,
      phoneNumber: body.phoneNumber,
    });
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: { email: string; password?: string; passwordRaw?: string }) {
    const inputPassword = body.password ?? body.passwordRaw ?? '';

    const user = await this.authService.validateUser(body.email, inputPassword);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials provided');
    }
    return this.authService.login(user);
  }

  @Get('confirm-email')
  async confirmEmail(@Query('token') token: string) {
    return this.authService.confirmEmail(token);
  }
}