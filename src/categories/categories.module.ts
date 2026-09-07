import { Module } from '@nestjs/common';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { PrismaService } from '../providers/database/prisma.service';

@Module({
  controllers: [CategoriesController],
  providers: [
    CategoriesService,
    {
      provide: PrismaService,
      useClass: PrismaService,
    },
  ],
  exports: [CategoriesService],
})
export class CategoriesModule {}