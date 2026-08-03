import { Controller, Get } from '@nestjs/common';
import { execSync } from 'child_process';

let cachedCommitHash: string;
function getCommitHash() {
  if (cachedCommitHash) return cachedCommitHash;
  try {
    cachedCommitHash = execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    cachedCommitHash = process.env.APP_VERSION || '1.0.2'; // Safe fallback if not in a git repo
  }
  return cachedCommitHash;
}

@Controller('api/health')
export class HealthController {
  @Get()
  checkHealth() {
    return {
      status: 'ok',
      service: 'Aviorè Go Backend Engine',
      version: getCommitHash(),
      timestamp: new Date().toISOString(),
    };
  }

  @Get('version')
  getAppVersion() {
    return {
      version: getCommitHash(), // 🟢 Automatically pulls the latest Git commit hash on deployment
      buildTime: new Date().toISOString(),
    };
  }
}