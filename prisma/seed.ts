import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);

// Cast prisma as any or use the adapter type assertion to clear TS7053/TS2339 errors
const prisma = new PrismaClient({ adapter }) as any;

const TAXONOMY_DATA = [
  { name: "Rice & Rice Meals", slug: "rice-rice-meals", sortOrder: 1, subcategories: ["Jollof Rice", "Fried Rice", "White Rice", "Coconut Rice", "Ofada Rice", "Native Rice", "Basmati Rice", "Rice & Beans", "Rice Bowls", "Special/Signature Rice"] },
  { name: "Swallow", slug: "swallow", sortOrder: 2, subcategories: ["Amala", "Eba", "Pounded Yam", "Semo/Semovita", "Wheat", "Fufu", "Oat Swallow", "Plantain Swallow"] },
  { name: "Soups & Stews", slug: "soups-stews", sortOrder: 3, subcategories: ["Egusi", "Efo Riro", "Okro", "Ogbono", "Ewedu", "Gbegiri", "Afang", "Edikang Ikong", "Oha", "Nsala/White Soup", "Banga", "Bitterleaf", "Vegetable Soup", "Seafood Soup", "Pepper Soup"] },
  { name: "Proteins", slug: "proteins", sortOrder: 4, subcategories: ["Beef", "Chicken", "Turkey", "Goat Meat", "Fish", "Catfish", "Croaker", "Titus", "Stockfish", "Ponmo", "Shaki", "Gizzard", "Snail", "Egg", "Assorted Meat", "Seafood"] },
  { name: "Grills & Barbecue", slug: "grills-barbecue", sortOrder: 5, subcategories: ["Grilled Chicken", "Grilled Fish", "Barbecue Chicken", "Barbecue Fish", "Asun", "Suya", "Gizzard", "Grilled Turkey", "Grilled Goat Meat", "Grilled Seafood"] },
  { name: "Fast Food", slug: "fast-food", sortOrder: 6, subcategories: ["Burger", "Fried Chicken", "Chicken & Chips", "Hot Dog", "Fries", "Pizza", "Sandwich", "Pasta", "Noodles", "Rice Bowls"] },
  { name: "Shawarma & Wraps", slug: "shawarma-wraps", sortOrder: 7, subcategories: ["Chicken Shawarma", "Beef Shawarma", "Mixed Shawarma", "Shawarma & Chips", "Chicken Wrap", "Beef Wrap", "Tortilla Wrap"] },
  { name: "Small Chops & Snacks", slug: "small-chops-snacks", sortOrder: 8, subcategories: ["Samosa", "Spring Roll", "Puff-Puff", "Chin Chin", "Meat Pie", "Chicken Pie", "Sausage Roll", "Doughnut", "Fish Roll", "Scotch Egg", "Small Chops Platter"] },
  { name: "Beans & Legumes", slug: "beans-legumes", sortOrder: 9, subcategories: ["Beans", "Ewa Agoyin", "Beans Pottage", "Akara", "Moi Moi", "Beans & Plantain", "Beans & Bread"] },
  { name: "Yam & Plantain", slug: "yam-plantain", sortOrder: 10, subcategories: ["Fried Yam", "Boiled Yam", "Yam Pottage", "Fried Plantain", "Boiled Plantain", "Plantain Pottage", "Dodo", "Yam & Egg"] },
  { name: "Breakfast", slug: "breakfast", sortOrder: 11, subcategories: ["Pap", "Akara", "Bread & Egg", "Tea & Bread", "Custard", "Pancakes", "French Toast", "Breakfast Platter", "Boiled Yam & Egg", "Fried Yam & Egg"] },
  { name: "Pasta & Noodles", slug: "pasta-noodles", sortOrder: 12, subcategories: ["Spaghetti", "Jollof Spaghetti", "Fried Spaghetti", "Macaroni", "Indomie", "Stir-Fried Noodles", "Pasta dishes"] },
  { name: "Seafood", slug: "seafood", sortOrder: 13, subcategories: ["Grilled Fish", "Fried Fish", "Catfish", "Croaker", "Prawns", "Shrimps", "Seafood Pasta", "Seafood Rice", "Seafood Soup"] },
  { name: "Pastries & Bakery", slug: "pastries-bakery", sortOrder: 14, subcategories: ["Cakes", "Cupcakes", "Bread", "Doughnuts", "Meat Pie", "Chicken Pie", "Sausage Roll", "Cookies", "Pastries"] },
  { name: "Desserts", slug: "desserts", sortOrder: 15, subcategories: ["Ice Cream", "Cake", "Brownies", "Cheesecake", "Fruit Salad", "Parfait", "Pancakes", "Waffles"] },
  { name: "Drinks", slug: "drinks", sortOrder: 16, subcategories: ["Soft Drinks", "Water", "Zobo", "Kunu", "Chapman", "Smoothies", "Fresh Juice", "Milkshake", "Coffee", "Tea"] }
];

const generateSlug = (text: string) => 
  text.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-");

async function seedTaxonomy() {
  console.log("🌱 Seeding AviorèGo taxonomy categories...");

  for (const cat of TAXONOMY_DATA) {
    const category = await prisma.foodCategory.upsert({
      where: { slug: cat.slug },
      update: { name: cat.name, sortOrder: cat.sortOrder },
      create: { name: cat.name, slug: cat.slug, sortOrder: cat.sortOrder },
    });

    const subcategoryOperations = cat.subcategories.map((subName) => {
      const subSlug = generateSlug(subName);
      return prisma.foodSubcategory.upsert({
        where: { slug: subSlug },
        update: { name: subName, categoryId: category.id },
        create: { name: subName, slug: subSlug, categoryId: category.id },
      });
    });

    await Promise.all(subcategoryOperations);
  }

  console.log("✅ Taxonomy seeding complete.");
}

seedTaxonomy()
  .catch((error) => {
    console.error("❌ Seeding failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });