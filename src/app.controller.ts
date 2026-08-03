import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('version')
getAppVersion() {
  return {
    version: process.env.APP_VERSION || '1.0.1', // Increment this when you deploy updates
    buildTime: process.env.BUILD_TIMESTAMP || Date.now(),
  };
}
}
