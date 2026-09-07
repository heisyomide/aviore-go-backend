import { Injectable } from '@nestjs/common';
import { PrismaService } from '../providers/database/prisma.service';

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  private get db(): any {
    return this.prisma;
  }

  async findAllCategories() {
    return this.db.foodCategory.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: {
        subcategories: {
          where: { isActive: true },
        },
      },
    });
  }

  async findSubcategoriesByCategory(categoryId: string) {
    return this.db.foodSubcategory.findMany({
      where: { categoryId, isActive: true },
    });
  }
}