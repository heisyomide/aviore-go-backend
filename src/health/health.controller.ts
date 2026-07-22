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
}