import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { JwtStrategy } from './strategy/jwt.strategy';
import { NotificationModule } from 'src/notification/notification.module';

@Module({
  imports: [
    UsersModule,
    PassportModule,
    NotificationModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'AVIORE_SECRET_KEY_2026',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  providers: [AuthService, JwtStrategy],
  controllers: [AuthController],
  exports: [AuthService, JwtModule], // <-- Add JwtModule and AuthService to exports!
})
export class AuthModule {}