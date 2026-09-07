import { Controller, Get, Param } from '@nestjs/common';
import { CategoriesService } from './categories.service';

@Controller('storefront/categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  async getCategories() {
    return this.categoriesService.findAllCategories();
  }

  @Get(':id/subcategories')
  async getSubcategories(@Param('id') id: string) {
    return this.categoriesService.findSubcategoriesByCategory(id);
  }
}