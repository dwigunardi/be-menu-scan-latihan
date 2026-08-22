import { PrismaClient, TableStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Starting MenuScan Database Seeding...');

  // -------------------------------------------------------------
  // 1. Seed Staff Users (Admin, Cashier, Kitchen, Waiter)
  // -------------------------------------------------------------
  const staffUsers = [
    {
      email: 'admin@menuscan.com',
      password: await bcrypt.hash('admin123', 10),
      name: 'Manager / Owner',
      role: 'ADMIN' as const,
    },
    {
      email: 'cashier@menuscan.com',
      password: await bcrypt.hash('cashier123', 10),
      name: 'Kasir Front POS',
      role: 'CASHIER' as const,
    },
    {
      email: 'kitchen@menuscan.com',
      password: await bcrypt.hash('kitchen123', 10),
      name: 'Head Chef / Barista',
      role: 'KITCHEN' as const,
    },
    {
      email: 'waiter@menuscan.com',
      password: await bcrypt.hash('waiter123', 10),
      name: 'Floor Staff / Waiter',
      role: 'WAITER' as const,
    },
  ];

  for (const staff of staffUsers) {
    const user = await prisma.user.upsert({
      where: { email: staff.email },
      update: {
        password: staff.password,
        name: staff.name,
        role: staff.role,
      },
      create: staff,
    });
    console.log(`✅ Staff user seeded: ${user.email} (Role: ${user.role})`);
  }

  // -------------------------------------------------------------
  // 2. Seed Table Zones & Cafe Tables
  // -------------------------------------------------------------
  const indoorZone = await prisma.tableZone.upsert({
    where: { name: 'Indoor (AC Non-Smoking)' },
    update: {
      description: 'Area berpendingin ruangan bebas asap rokok, cocok untuk kerja dan makan santai.',
      color: 'blue',
      sortOrder: 1,
    },
    create: {
      name: 'Indoor (AC Non-Smoking)',
      description: 'Area berpendingin ruangan bebas asap rokok, cocok untuk kerja dan makan santai.',
      color: 'blue',
      sortOrder: 1,
    },
  });

  const outdoorZone = await prisma.tableZone.upsert({
    where: { name: 'Outdoor (Garden Smoking)' },
    update: {
      description: 'Area terbuka dengan tanaman asri, diperbolehkan merokok.',
      color: 'emerald',
      sortOrder: 2,
    },
    create: {
      name: 'Outdoor (Garden Smoking)',
      description: 'Area terbuka dengan tanaman asri, diperbolehkan merokok.',
      color: 'emerald',
      sortOrder: 2,
    },
  });

  const vipZone = await prisma.tableZone.upsert({
    where: { name: 'VIP Lounge / Meeting' },
    update: {
      description: 'Ruang privat eksklusif dengan fasilitas rapat dan sofa santai keluarga.',
      color: 'amber',
      sortOrder: 3,
    },
    create: {
      name: 'VIP Lounge / Meeting',
      description: 'Ruang privat eksklusif dengan fasilitas rapat dan sofa santai keluarga.',
      color: 'amber',
      sortOrder: 3,
    },
  });

  const tablesSeedData = [
    { number: 'Meja 01', capacity: 4, zoneId: indoorZone.id, seatingType: 'DINING', tags: ['OUTLET'] },
    { number: 'Meja 02', capacity: 4, zoneId: indoorZone.id, seatingType: 'SOFA', tags: ['OUTLET', 'WINDOW_VIEW'] },
    { number: 'Meja 03', capacity: 2, zoneId: indoorZone.id, seatingType: 'DINING', tags: ['AC'] },
    { number: 'Meja 04', capacity: 6, zoneId: indoorZone.id, seatingType: 'BOOTH', tags: ['OUTLET', 'AC'] },
    { number: 'Meja 05', capacity: 2, zoneId: outdoorZone.id, seatingType: 'BAR', tags: ['SMOKING'] },
    { number: 'Meja 06', capacity: 4, zoneId: outdoorZone.id, seatingType: 'BOOTH', tags: ['SMOKING', 'WINDOW_VIEW'] },
    { number: 'Meja 07', capacity: 4, zoneId: outdoorZone.id, seatingType: 'DINING', tags: ['SMOKING'] },
    { number: 'Meja 08', capacity: 4, zoneId: outdoorZone.id, seatingType: 'DINING', tags: ['SMOKING', 'OUTLET'] },
    { number: 'Meja 09', capacity: 8, zoneId: vipZone.id, seatingType: 'FAMILY', tags: ['OUTLET', 'AC', 'WHEELCHAIR'] },
    { number: 'Meja 10', capacity: 10, zoneId: vipZone.id, seatingType: 'SOFA', tags: ['OUTLET', 'AC', 'WINDOW_VIEW'] },
  ];

  for (const t of tablesSeedData) {
    await prisma.table.upsert({
      where: { number: t.number },
      update: {
        capacity: t.capacity,
        zoneId: t.zoneId,
        seatingType: t.seatingType,
        tags: t.tags,
      },
      create: {
        number: t.number,
        capacity: t.capacity,
        status: TableStatus.VACANT,
        zoneId: t.zoneId,
        seatingType: t.seatingType,
        tags: t.tags,
      },
    });
  }
  console.log(`✅ 3 Zones and ${tablesSeedData.length} enriched Tables seeded.`);

  // -------------------------------------------------------------
  // 3. Seed Promotional Banners
  // -------------------------------------------------------------
  const bannersData = [
    {
      title: 'Morning Coffee Booster ☕',
      description: 'Diskon 20% untuk semua varian Espresso & Latte sebelum jam 11:00 WIB.',
      imageUrl: 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=800&auto=format&fit=crop&q=80',
      targetUrl: '/menus?category=coffee',
      sortOrder: 1,
      isActive: true,
    },
    {
      title: 'Weekend Combo Deal 🍔🍟',
      description: 'Beli Nasi Goreng Spesial / Burger gratis Ice Lemon Tea!',
      imageUrl: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800&auto=format&fit=crop&q=80',
      targetUrl: '/menus?category=local-favorites',
      sortOrder: 2,
      isActive: true,
    },
    {
      title: 'Sweet Desserts & Pastry 🥐🍰',
      description: 'Nikmati Butter Croissant hangat dengan racikan matcha premium.',
      imageUrl: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=800&auto=format&fit=crop&q=80',
      targetUrl: '/menus?category=desserts',
      sortOrder: 3,
      isActive: true,
    },
  ];

  // Clean and insert banners
  await prisma.promoBanner.deleteMany({});
  for (const banner of bannersData) {
    await prisma.promoBanner.create({ data: banner });
  }
  console.log(`✅ ${bannersData.length} Promo Banners seeded.`);

  // -------------------------------------------------------------
  // 4. Seed Categories
  // -------------------------------------------------------------
  const categoriesData = [
    { name: 'Specialty Coffee', slug: 'coffee', sortOrder: 1 },
    { name: 'Tea & Non-Coffee', slug: 'beverages', sortOrder: 2 },
    { name: 'Local Favorites', slug: 'local-favorites', sortOrder: 3 },
    { name: 'Finger Food & Snacks', slug: 'snacks', sortOrder: 4 },
    { name: 'Desserts & Pastry', slug: 'desserts', sortOrder: 5 },
  ];

  const categoryMap = new Map<string, string>();

  for (const cat of categoriesData) {
    const created = await prisma.category.upsert({
      where: { slug: cat.slug },
      update: { name: cat.name, sortOrder: cat.sortOrder, deletedAt: null },
      create: cat,
    });
    categoryMap.set(cat.slug, created.id);
  }
  console.log(`✅ ${categoriesData.length} Menu Categories seeded.`);

  // -------------------------------------------------------------
  // 5. Seed Menu Items & Nested Variant Groups & Options
  // -------------------------------------------------------------
  const menuItemsData = [
    // 1. Caramel Macchiato
    {
      name: 'Caramel Macchiato',
      description: 'Fresh espresso dipadukan dengan vanilla syrup, steamed milk, dan caramel drizzle lezat.',
      price: 35000,
      promoPrice: 30000,
      imageUrl: 'https://images.unsplash.com/photo-1485808191679-5f86510681a2?w=600&auto=format&fit=crop&q=80',
      rating: 4.9,
      reviewCount: 128,
      isAvailable: true,
      isBestSeller: true,
      isRecommended: true,
      categorySlug: 'coffee',
      variantGroups: [
        {
          name: 'Pilih Ukuran',
          isRequired: true,
          minSelect: 1,
          maxSelect: 1,
          options: [
            { name: 'Regular (12 oz)', extraPrice: 0, isAvailable: true },
            { name: 'Large (16 oz)', extraPrice: 6000, isAvailable: true },
          ],
        },
        {
          name: 'Suhu Penyajian',
          isRequired: true,
          minSelect: 1,
          maxSelect: 1,
          options: [
            { name: 'Hot', extraPrice: 0, isAvailable: true },
            { name: 'Iced', extraPrice: 2000, isAvailable: true },
          ],
        },
        {
          name: 'Extra Add-ons',
          isRequired: false,
          minSelect: 0,
          maxSelect: 3,
          options: [
            { name: 'Extra Espresso Shot', extraPrice: 6000, isAvailable: true },
            { name: 'Oat Milk Substitution', extraPrice: 8000, isAvailable: true },
            { name: 'Whipped Cream', extraPrice: 4000, isAvailable: true },
          ],
        },
      ],
    },

    // 2. Americano / Long Black
    {
      name: 'Americano Classic',
      description: 'Double shot espresso arabica blend dengan air panas atau es segar.',
      price: 25000,
      promoPrice: null,
      imageUrl: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=600&auto=format&fit=crop&q=80',
      rating: 4.8,
      reviewCount: 95,
      isAvailable: true,
      isBestSeller: false,
      isRecommended: false,
      categorySlug: 'coffee',
      variantGroups: [
        {
          name: 'Pilih Ukuran',
          isRequired: true,
          minSelect: 1,
          maxSelect: 1,
          options: [
            { name: 'Regular', extraPrice: 0, isAvailable: true },
            { name: 'Large', extraPrice: 5000, isAvailable: true },
          ],
        },
        {
          name: 'Suhu Penyajian',
          isRequired: true,
          minSelect: 1,
          maxSelect: 1,
          options: [
            { name: 'Hot', extraPrice: 0, isAvailable: true },
            { name: 'Iced', extraPrice: 2000, isAvailable: true },
          ],
        },
      ],
    },

    // 3. Matcha Oat Latte
    {
      name: 'Matcha Oat Latte',
      description: 'Pure Uji Matcha organik jepang diseduh dengan susu oat creamy nabati.',
      price: 38000,
      promoPrice: 34000,
      imageUrl: 'https://images.unsplash.com/photo-1536256263959-770b48d82b0a?w=600&auto=format&fit=crop&q=80',
      rating: 4.9,
      reviewCount: 142,
      isAvailable: true,
      isBestSeller: true,
      isRecommended: true,
      categorySlug: 'beverages',
      variantGroups: [
        {
          name: 'Suhu Penyajian',
          isRequired: true,
          minSelect: 1,
          maxSelect: 1,
          options: [
            { name: 'Hot', extraPrice: 0, isAvailable: true },
            { name: 'Iced', extraPrice: 2000, isAvailable: true },
          ],
        },
        {
          name: 'Tingkat Kemanisan',
          isRequired: true,
          minSelect: 1,
          maxSelect: 1,
          options: [
            { name: 'Normal Sweetness (100%)', extraPrice: 0, isAvailable: true },
            { name: 'Less Sugar (50%)', extraPrice: 0, isAvailable: true },
            { name: 'No Sugar (0%)', extraPrice: 0, isAvailable: true },
          ],
        },
      ],
    },

    // 4. Nasi Goreng Spesial Cafe
    {
      name: 'Nasi Goreng Spesial Cafe',
      description: 'Nasi goreng bumbu rempah khas nusantara dengan suwiran ayam, acar, dan kerupuk udang renyah.',
      price: 42000,
      promoPrice: null,
      imageUrl: 'https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=600&auto=format&fit=crop&q=80',
      rating: 4.8,
      reviewCount: 210,
      isAvailable: true,
      isBestSeller: true,
      isRecommended: true,
      categorySlug: 'local-favorites',
      variantGroups: [
        {
          name: 'Level Kepedasan',
          isRequired: true,
          minSelect: 1,
          maxSelect: 1,
          options: [
            { name: 'Tidak Pedas (Level 0)', extraPrice: 0, isAvailable: true },
            { name: 'Sedang (Level 1)', extraPrice: 0, isAvailable: true },
            { name: 'Pedas Mantap (Level 2)', extraPrice: 0, isAvailable: true },
            { name: 'Extra Pedas (Level 3)', extraPrice: 2000, isAvailable: true },
          ],
        },
        {
          name: 'Pilihan Telur',
          isRequired: true,
          minSelect: 1,
          maxSelect: 1,
          options: [
            { name: 'Telur Mata Sapi (Setengah Matang)', extraPrice: 0, isAvailable: true },
            { name: 'Telur Mata Sapi (Matang)', extraPrice: 0, isAvailable: true },
            { name: 'Telur Dadar Gurih', extraPrice: 0, isAvailable: true },
          ],
        },
        {
          name: 'Tambahan Topping',
          isRequired: false,
          minSelect: 0,
          maxSelect: 2,
          options: [
            { name: 'Extra Sosis Sapi Bakar', extraPrice: 6000, isAvailable: true },
            { name: 'Extra Bakso Sapi Iris', extraPrice: 6000, isAvailable: true },
          ],
        },
      ],
    },

    // 5. Truffle Parmesan French Fries
    {
      name: 'Truffle Parmesan French Fries',
      description: 'Kentang goreng renyah berbalut minyak truffle aromatik, taburan keju parmesan, dan saus cocolan.',
      price: 28000,
      promoPrice: null,
      imageUrl: 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=600&auto=format&fit=crop&q=80',
      rating: 4.7,
      reviewCount: 88,
      isAvailable: true,
      isBestSeller: false,
      isRecommended: true,
      categorySlug: 'snacks',
      variantGroups: [
        {
          name: 'Pilihan Saus',
          isRequired: true,
          minSelect: 1,
          maxSelect: 1,
          options: [
            { name: 'Truffle Garlic Mayo', extraPrice: 0, isAvailable: true },
            { name: 'Smoky BBQ Sauce', extraPrice: 0, isAvailable: true },
            { name: 'Spicy Cheese Sauce', extraPrice: 2000, isAvailable: true },
          ],
        },
      ],
    },

    // 6. French Butter Croissant
    {
      name: 'French Butter Croissant',
      description: 'Pastry khas Prancis berlapis mentega Elle & Vire premium yang renyah di luar dan lembut di dalam.',
      price: 25000,
      promoPrice: 22000,
      imageUrl: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=600&auto=format&fit=crop&q=80',
      rating: 4.9,
      reviewCount: 65,
      isAvailable: true,
      isBestSeller: false,
      isRecommended: false,
      categorySlug: 'desserts',
      variantGroups: [
        {
          name: 'Penyajian',
          isRequired: true,
          minSelect: 1,
          maxSelect: 1,
          options: [
            { name: 'Dihangatkan (Warm)', extraPrice: 0, isAvailable: true },
            { name: 'Suhu Ruangan (Original)', extraPrice: 0, isAvailable: true },
          ],
        },
      ],
    },

    // 7. Mineral Water (No Variants)
    {
      name: 'Air Mineral Prima 600ml',
      description: 'Air mineral pegunungan botol dingin atau suhu normal.',
      price: 10000,
      promoPrice: null,
      imageUrl: 'https://images.unsplash.com/photo-1548839140-29a749e1bc4e?w=600&auto=format&fit=crop&q=80',
      rating: 5.0,
      reviewCount: 30,
      isAvailable: true,
      isBestSeller: false,
      isRecommended: false,
      categorySlug: 'beverages',
      variantGroups: [],
    },
  ];

  for (const item of menuItemsData) {
    const categoryId = categoryMap.get(item.categorySlug);
    if (!categoryId) continue;

    // Check if menu already exists
    const existing = await prisma.menuItem.findFirst({
      where: { name: item.name, deletedAt: null },
    });

    if (existing) {
      await prisma.menuItem.update({
        where: { id: existing.id },
        data: {
          description: item.description,
          price: item.price,
          promoPrice: item.promoPrice,
          imageUrl: item.imageUrl,
          rating: item.rating,
          reviewCount: item.reviewCount,
          isAvailable: item.isAvailable,
          isBestSeller: item.isBestSeller,
          isRecommended: item.isRecommended,
          categoryId,
        },
      });
    } else {
      await prisma.menuItem.create({
        data: {
          name: item.name,
          description: item.description,
          price: item.price,
          promoPrice: item.promoPrice,
          imageUrl: item.imageUrl,
          rating: item.rating,
          reviewCount: item.reviewCount,
          isAvailable: item.isAvailable,
          isBestSeller: item.isBestSeller,
          isRecommended: item.isRecommended,
          categoryId,
          variantGroups: item.variantGroups.length > 0
            ? {
                create: item.variantGroups.map((vg) => ({
                  name: vg.name,
                  isRequired: vg.isRequired,
                  minSelect: vg.minSelect,
                  maxSelect: vg.maxSelect,
                  options: {
                    create: vg.options.map((opt) => ({
                      name: opt.name,
                      extraPrice: opt.extraPrice,
                      isAvailable: opt.isAvailable,
                    })),
                  },
                })),
              }
            : undefined,
        },
      });
    }
  }

  console.log(`✅ ${menuItemsData.length} Menu Items with nested variants seeded successfully.`);
  console.log('\n🎉 Database Seeding Completed Successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
