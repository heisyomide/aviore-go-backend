import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';


@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(

  
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'your_super_secret_key',
    });
  }

  async validate(payload: any) {
    console.log("JWT payload:", payload);
    // This return value is attached to the request object (req.user)
    return { userId: payload.sub, email: payload.email , role: payload.role};
  }
}