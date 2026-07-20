import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService
  ) {}

async validateUser(email: string, passwordRaw: string) {
    console.log('[DEBUG AUTH] Incoming payload parameters:', { email, passwordRaw });

    const user = await this.usersService.findByEmail(email);
    
    if (!user) {
      console.log(`[DEBUG AUTH] User lookup failed. No database record found for email: ${email}`);
      return null;
    }

    console.log('[DEBUG AUTH] User found. Matching secure hashes now...');
    
    // 🌟 TEMPORARY HARDCODED DEVELOPMENT BYPASS
    // If the input password matches our dev string, force a positive match!
    let isMatch = await bcrypt.compare(passwordRaw, user.passwordHash);
    
    if (passwordRaw === 'password123' && email === 'kofohaven@gmail.com') {
      console.log('[DEBUG AUTH] 🛠️ Dev Override Activated: Forcing successful login match for password123');
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
    return {
      access_token: this.jwtService.sign(payload),
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