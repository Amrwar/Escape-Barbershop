import { PrismaClient, CommissionType } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Services excluded from barber commission (base services the shop charges for)
const NO_COMMISSION_SERVICES = new Set([
  "Hair cut",
  "Beard cut",
  "curly or hair dryer",
  "external hair dryer",
  "hair dryer for tall hair",
  "hair dryer for beard",
]);

const SERVICES: { name: string; arabicName: string }[] = [
  { name: "Hair cut",                arabicName: "قص شعر" },
  { name: "Beard cut",               arabicName: "قص لحية" },
  { name: "curly or hair dryer",     arabicName: "كيرلي أو سشوار" },
  { name: "kids Hair cut",           arabicName: "قص شعر أطفال" },
  { name: "nose and ear wax",        arabicName: "شمع أنف وأذن" },
  { name: "whole wax",               arabicName: "شمع كامل" },
  { name: "hair dye",                arabicName: "صبغة شعر" },
  { name: "beard dye",               arabicName: "صبغة لحية" },
  { name: "rinsage",                 arabicName: "رينساج" },
  { name: "hair protein",            arabicName: "بروتين شعر" },
  { name: "face string",             arabicName: "خيط وجه" },
  { name: "american straightening",  arabicName: "فرد أمريكي" },
  { name: "silver dye",              arabicName: "صبغة فضية" },
  { name: "beard henna",             arabicName: "حناء لحية" },
  { name: "dandruff removal",        arabicName: "إزالة قشرة" },
  { name: "topic thickening",        arabicName: "تكثيف موضعي" },
  { name: "oil bath argan",          arabicName: "حمام زيت أرغان" },
  { name: "oil bath loreal",         arabicName: "حمام زيت لوريال" },
  { name: "hair henna",              arabicName: "حناء شعر" },
  { name: "oil bath beard",          arabicName: "حمام زيت لحية" },
  { name: "external hair dryer",     arabicName: "سشوار خارجي" },
  { name: "groom external package",  arabicName: "باقة عريس خارجية" },
  { name: "groom internal package",  arabicName: "باقة عريس داخلية" },
  { name: "extras",                  arabicName: "إضافات" },
  { name: "highlights",              arabicName: "هايلايت" },
  { name: "hair dryer for tall hair",arabicName: "سشوار للشعر الطويل" },
  { name: "douglas",                 arabicName: "داغلاس" },
  { name: "hair dryer for beard",    arabicName: "سشوار لحية" },
];

async function main() {
  console.log("Seeding database...");

  // Upsert services (update arabicName + excludeFromCommission on each run)
  for (const { name, arabicName } of SERVICES) {
    const excludeFromCommission = NO_COMMISSION_SERVICES.has(name);
    await prisma.service.upsert({
      where: { name },
      update: { arabicName, excludeFromCommission },
      create: { name, arabicName, defaultPrice: 0, isActive: true, excludeFromCommission },
    });
  }
  console.log(`Seeded ${SERVICES.length} services`);

  // Upsert app settings — default discount PIN
  await prisma.setting.upsert({
    where: { key: "discount_pin" },
    update: {},
    create: { key: "discount_pin", value: "1234" },
  });
  console.log("Default discount PIN seeded (1234)");

  // Create default owner
  const ownerEmail = process.env.SEED_OWNER_EMAIL ?? "owner@barbershop.com";
  const ownerPassword = process.env.SEED_OWNER_PASSWORD ?? "changeme123";
  const hashedPassword = await bcrypt.hash(ownerPassword, 12);

  await prisma.user.upsert({
    where: { email: ownerEmail },
    update: {},
    create: {
      email: ownerEmail,
      password: hashedPassword,
      name: "Owner",
      role: "OWNER",
    },
  });
  console.log(`Owner account: ${ownerEmail} / ${ownerPassword}`);

  // Create a sample barber
  const barber = await prisma.barber.upsert({
    where: { id: "sample-barber-1" },
    update: {},
    create: {
      id: "sample-barber-1",
      name: "Ahmed",
      isActive: true,
    },
  });

  // Salary settings for barber
  await prisma.barberSalarySettings.upsert({
    where: { barberId: barber.id },
    update: {},
    create: {
      barberId: barber.id,
      baseSalary: 3000,
      commissionType: CommissionType.PERCENT,
      commissionValue: 10,
    },
  });

  // Create barber user account
  const barberPassword = await bcrypt.hash("barber123", 12);
  await prisma.user.upsert({
    where: { email: "ahmed@barbershop.com" },
    update: {},
    create: {
      email: "ahmed@barbershop.com",
      password: barberPassword,
      name: "Ahmed",
      role: "BARBER",
      barberId: barber.id,
    },
  });
  console.log("Sample barber account: ahmed@barbershop.com / barber123");

  console.log("Seeding complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
