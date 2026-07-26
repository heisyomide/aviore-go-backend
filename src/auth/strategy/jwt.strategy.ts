import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../providers/database/prisma.service'; // 👈 Adjust path to your PrismaService

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'your_super_secret_key',
    });
  }

  async validate(payload: any) {
    console.log('[DEBUG JWT] Validating Payload:', payload);

    const id = payload.sub || payload.id || payload.userId;

    if (!id) {
      throw new UnauthorizedException('Invalid token structure');
    }

    // Check user in DB
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new UnauthorizedException('User account no longer exists.');
    }

    // 🟢 Attach both `id` and `userId` to support all controller usages!
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