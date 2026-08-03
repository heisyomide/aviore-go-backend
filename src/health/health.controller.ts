import { Controller, Get } from '@nestjs/common';

@Controller('api/health')
export class HealthController {
  @Get()
  checkHealth() {
    return {
      status: 'ok',
      service: 'Aviorè Go Backend Engine',
      timestamp: new Date().toISOString(),
    };
  }

    @Get('version') // 🟢 Forces it to be available at /api/version regardless of global settings
  getAppVersion() {
    return {
      version: process.env.APP_VERSION || '1.0.2',
      buildTime: new Date().toISOString(),
    };
  }
}