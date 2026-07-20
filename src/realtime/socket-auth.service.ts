import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { JwtService } from '@nestjs/jwt';

@Injectable()
export class SocketAuthService {
  constructor(
    private readonly jwtService: JwtService,
  ) {}

  verifyToken(token: string) {
    try {
      return this.jwtService.verify(token);
    } catch {
      throw new UnauthorizedException(
        'Invalid socket token.',
      );
    }
  }
}