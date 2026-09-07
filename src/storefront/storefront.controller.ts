import { Controller, Get, Param, Query } from '@nestjs/common';
import { StorefrontService } from './storefront.service';

@Controller('storefront')
export class StorefrontController {
  constructor(private readonly storefrontService: StorefrontService) {}

  // GET /storefront/home - Aggregated data for homepage feed
@Get('home')
async getHomePageData(
  @Query('lat') lat?: string,
  @Query('lng') lng?: string,
  @Query('category') category?: string,
) {
  return this.storefrontService.getHomePageData(
    lat ? parseFloat(lat) : undefined, 
    lng ? parseFloat(lng) : undefined,
    category
  );
}

// GET /storefront/food-items?category=local
@Get('food-items')
async getFoodItemsByCategory(@Query('category') category?: string) {
  return this.storefrontService.getFoodItemsByCategory(category);
}

@Get('categories')
async getAvailableCategories() {
  return this.storefrontService.getAvailableCategories();
}

  // GET /storefront/restaurants/:slug - Public restaurant profile + menu
@Get('restaurants/:id')
  async getMerchantById(@Param('id') id: string) {
    return this.storefrontService.getMerchantById(id);
  }
  // GET /storefront/search - Search food items or restaurants
  @Get('search')
  async searchMarketplace(@Query('q') query: string) {
    return this.storefrontService.searchMarketplace(query);
  }

  @Get('merchants/:id')
  getMerchantProfile(@Param('id') id: string) {
    return this.storefrontService.getMerchantStorefront(id);
  }

  @Get('merchants/:id/menu')
  getMerchantMenu(@Param('id') id: string) {
    return this.storefrontService.getMerchantMenu(id);
  }
}