import { Module } from '@nestjs/common';
import { DisputeController } from './dispute.controller';
import { DisputeService } from './dispute.service';
import { PrismaService } from '../providers/database/prisma.service';// Adjust path

@Module({
  
  controllers: [DisputeController],
  providers: [DisputeService, PrismaService],
  exports: [DisputeService],
})
export class DisputeModule {}