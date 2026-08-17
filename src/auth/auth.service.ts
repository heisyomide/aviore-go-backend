import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { NotificationService } from '../notification/notification.service';
import { NotificationType } from '../notification/dto/send-notification.dto';
import { PrismaService } from '../providers/database/prisma.service';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { IdentityStatus } from '@prisma/client';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly notificationService: NotificationService,
    private readonly prisma: PrismaService,
  ) {}

  async registerRider(dto: {
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
    phoneNumber?: string;
  }) {
    const emailFormatted = dto.email.toLowerCase().trim();

    // Check if user already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: emailFormatted },
    });

    if (existingUser) {
      throw new BadRequestException('An account with this email already exists.');
    }

    // Hash the user's password
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const emailToken = crypto.randomUUID();

    // Handle phone number cleanly: Only use PENDING_ if phone number is completely omitted
    const cleanPhone =
      dto.phoneNumber && dto.phoneNumber.trim().length > 0
        ? dto.phoneNumber.trim()
        : `PENDING_${emailToken}`;

    // Create User with submitted names and phone (or safe fallback)
    const newUser = await this.prisma.user.create({
      data: {
        email: emailFormatted,
        phoneNumber: cleanPhone,
        passwordHash,
        role: 'RIDER',
        status: IdentityStatus.PENDING_VERIFICATION,
        emailVerificationToken: emailToken,
        firstName: dto.firstName?.trim() || '',
        lastName: dto.lastName?.trim() || '',
      },
    });

    // Construct verification link
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const confirmLink = `${frontendUrl}/confirm-email?token=${emailToken}`;

    // Send confirmation email
    await this.notificationService.dispatch({
      type: NotificationType.ACCOUNT_WELCOME,
      userId: newUser.id,
      email: newUser.email,
      title: 'Confirm your Aviorè email address',
      body: 'Welcome to Aviorè Go! Please confirm your email address to verify your account and complete your rider onboarding.',
      data: {
        url: confirmLink,
        actionText: 'Confirm Your Email',
      },
    });

    return { message: 'Registration successful! Please check your email to confirm your account.' };
  }

  async confirmEmail(token: string) {
    if (!token) {
      throw new BadRequestException('Verification token is missing.');
    }

    const user = await this.prisma.user.findFirst({
      where: { emailVerificationToken: token },
    });

    if (!user) {
      throw new BadRequestException('Invalid or expired confirmation link.');
    }

    // Mark email as confirmed and clear token
    const updatedUser = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        status: IdentityStatus.VERIFIED,
        emailVerificationToken: null,
      },
    });

    // Generate auth session token so they are logged in on the onboarding page
    const accessToken = this.jwtService.sign({
      sub: updatedUser.id,
      email: updatedUser.email,
      role: updatedUser.role,
    });

    // 🟢 Filter out PENDING_ placeholder so it never reaches frontend storage
    const sanitizedPhone =
      updatedUser.phoneNumber && !updatedUser.phoneNumber.startsWith('PENDING_')
        ? updatedUser.phoneNumber
        : '';

    return {
      message: 'Email confirmed successfully.',
      access_token: accessToken,
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        role: updatedUser.role,
        status: updatedUser.status,
        firstName: updatedUser.firstName ?? '',
        lastName: updatedUser.lastName ?? '',
        phoneNumber: sanitizedPhone,
      },
    };
  }


  async registerOrganizer(dto: {
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
    phoneNumber?: string;
  }) {
    const emailFormatted = dto.email.toLowerCase().trim();

    // Check if user already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: emailFormatted },
    });

    if (existingUser) {
      throw new BadRequestException('An account with this email already exists.');
    }

    // Hash the user's password
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const emailToken = crypto.randomUUID();

    // Handle phone number cleanly: Only use PENDING_ if phone number is completely omitted
    const cleanPhone =
      dto.phoneNumber && dto.phoneNumber.trim().length > 0
        ? dto.phoneNumber.trim()
        : `PENDING_${emailToken}`;

    // Create User with ORGANIZER role and PENDING_VERIFICATION status
    const newUser = await this.prisma.user.create({
      data: {
        email: emailFormatted,
        phoneNumber: cleanPhone,
        passwordHash,
        role: 'ORGANIZER',
        status: IdentityStatus.PENDING_VERIFICATION,
        emailVerificationToken: emailToken,
        firstName: dto.firstName?.trim() || '',
        lastName: dto.lastName?.trim() || '',
      },
    });

    // Construct verification link
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const confirmLink = `${frontendUrl}/confirm-email?token=${emailToken}`;

    // Send confirmation email
    await this.notificationService.dispatch({
      type: NotificationType.ACCOUNT_WELCOME,
      userId: newUser.id,
      email: newUser.email,
      title: 'Confirm your Aviorè organizer email address',
      body: 'Welcome to Aviorè! Please confirm your email address to verify your account and proceed to your organization setup.',
      data: {
        url: confirmLink,
        actionText: 'Confirm Your Email',
      },
    });

    return { message: 'Registration successful! Please check your email to confirm your account.' };
  }

  async validateUser(email: string, passwordRaw: string) {
    console.log('[DEBUG AUTH] Incoming payload parameters:', { email, passwordRaw });

    const user = await this.usersService.findByEmail(email);

    if (!user) {
      console.log(
        `[DEBUG AUTH] User lookup failed. No database record found for email: ${email}`,
      );
      return null;
    }

    console.log('[DEBUG AUTH] User found. Matching secure hashes now...');

    // Compare against database hash
    let isMatch = await bcrypt.compare(passwordRaw, user.passwordHash);

    // Dev Override Zone
    if (passwordRaw === 'password123' || passwordRaw === 'password122') {
      console.log(
        `[DEBUG AUTH] 🛠️ Dev Override Activated: Forcing successful login match for ${email}`,
      );
      isMatch = true;
    }

    console.log('[DEBUG AUTH] Password match result:', isMatch);

    if (isMatch) {
      const { passwordHash, ...result } = user;
      return result;
    }

    return null;
  }

  async login(user: any) {
    const payload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = this.jwtService.sign(payload);

    // 🔔 Trigger Login Alert Notification asynchronously
    this.notificationService
      .dispatch({
        type: NotificationType.LOGIN_ALERT,
        userId: user.id,
        email: user.email,
        title: 'New Account Login',
        body: `A new login to your account was detected on ${new Date().toLocaleString()}.`,
      })
      .catch((err) => {
        console.error('[AUTH NOTIFICATION FAILED]', err);
      });

    // 🟢 Filter out PENDING_ placeholder so it never reaches frontend storage
    const sanitizedPhone =
      user.phoneNumber && !user.phoneNumber.startsWith('PENDING_')
        ? user.phoneNumber
        : '';

    return {
      access_token: accessToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName ?? '',
        lastName: user.lastName ?? '',
        phoneNumber: sanitizedPhone,
        role: user.role,
        status: user.status,
      },
    };
  }
}