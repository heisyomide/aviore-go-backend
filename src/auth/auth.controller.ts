import { Controller, Post, Body, UnauthorizedException, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { UserRole } from '@prisma/client';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private usersService: UsersService
  ) {}
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

  // Create the new user
  const user = await this.usersService.createUser({
    email,
    phoneNumber,
    firstName,
    lastName,
    role,
    passwordRaw: password ?? passwordRaw ?? '',
  });

  // Automatically authenticate the newly created user
  return this.authService.login(user);
}

@Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: { email: string; password?: string; passwordRaw?: string }) {
    // 🌟 Safely capture either 'password' or 'passwordRaw' from the incoming request body
    const inputPassword = body.password ?? body.passwordRaw ?? '';

    const user = await this.authService.validateUser(body.email, inputPassword);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials provided');
    }
    return this.authService.login(user);
  }
}