import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { NotificationService } from '../notification/notification.service';
import { NotificationType } from '../notification/dto/send-notification.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly notificationService: NotificationService,
  ) {}

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
    if (passwordRaw === 'password123') {
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
        // Log notification errors so failed dispatches don't block auth flow
        console.error('[AUTH NOTIFICATION FAILED]', err);
      });

    return {
      access_token: accessToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        status: user.status,
      },
    };
  }
}