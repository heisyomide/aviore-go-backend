// src/auth/strategies/jwt.strategy.ts
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '../../providers/database/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        // 1. Extract from Authorization: Bearer <token>
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        // 2. Extract from Cookie (fallback)
        (req: Request) => {
          if (req && req.cookies) {
            return req.cookies['access_token'] || req.cookies['adminToken'] || null;
          }
          return null;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'your_super_secret_key',
    });
  }

  async validate(payload: any) {
    const id = payload.sub || payload.id || payload.userId;

    if (!id) {
      throw new UnauthorizedException('Invalid token structure');
    }

    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new UnauthorizedException('User account no longer exists.');
    }

    return {
      id: user.id,
      userId: user.id,
      sub: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
    };
  }
}