import 'dotenv/config';
import { PrismaClient, UserRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import * as bcrypt from 'bcrypt';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('?? Seeding default admin account...');

  const hashedPassword = await bcrypt.hash('admin123', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@menuscan.com' },
    update: { password: hashedPassword },
    create: {
      email: 'admin@menuscan.com',
      password: hashedPassword,
      name: 'Admin Manager',
      role: UserRole.ADMIN,
    },
  });

  console.log('? Seed complete:');
  console.log(`   Admin: ${admin.email} (password: admin123)`);
}

main()
  .catch((e) => {
    console.error('? Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
