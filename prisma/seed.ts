import { randomBytes } from "crypto";
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

/**
 * Roughly how long each service takes a chair, used to lay out the booking
 * calendar. Anything not listed starts at 30 minutes. These are only ever set
 * when a service is first created, so the owner's own edits are never undone.
 */
const SERVICE_MINUTES: Record<string, number> = {
  "Hair cut": 30,
  "Beard cut": 20,
  "kids Hair cut": 30,
  "nose and ear wax": 15,
  "whole wax": 30,
  "face string": 20,
  "curly or hair dryer": 30,
  "external hair dryer": 20,
  "hair dryer for tall hair": 30,
  "hair dryer for beard": 15,
  "hair dye": 45,
  "beard dye": 30,
  "silver dye": 60,
  "highlights": 90,
  "hair protein": 120,
  "american straightening": 120,
  "rinsage": 45,
  "oil bath argan": 30,
  "oil bath loreal": 30,
  "oil bath beard": 20,
  "hair henna": 45,
  "beard henna": 30,
  "dandruff removal": 30,
  "topic thickening": 45,
  "groom external package": 90,
  "groom internal package": 90,
  "douglas": 45,
  "extras": 15,
};

const DEFAULT_SERVICE_MINUTES = 30;

async function main() {
  console.log("Seeding database...");

  // Upsert services (update arabicName + excludeFromCommission on each run)
  for (const { name, arabicName } of SERVICES) {
    const excludeFromCommission = NO_COMMISSION_SERVICES.has(name);
    await prisma.service.upsert({
      where: { name },
      update: { arabicName, excludeFromCommission },
      create: {
        name,
        arabicName,
        defaultPrice: 0,
        isActive: true,
        excludeFromCommission,
        durationMinutes: SERVICE_MINUTES[name] ?? DEFAULT_SERVICE_MINUTES,
      },
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

  // Create default owner.
  // A password committed to the repository is a password everybody knows, so the
  // seed takes it from the environment and otherwise generates a one-off and
  // prints it. Change it in the app (Account) after the first sign-in.
  const ownerEmail = process.env.SEED_OWNER_EMAIL ?? "Admin@escape.com";
  const ownerPassword = process.env.SEED_OWNER_PASSWORD ?? randomBytes(9).toString("base64url");
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
  if (!process.env.SEED_OWNER_PASSWORD) {
    console.log("  ^ generated for this run only. Existing accounts are never overwritten.");
  }

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

  // Create the sample cashier the same way: no password lives in this file.
  const cashierPlain = process.env.SEED_CASHIER_PASSWORD ?? randomBytes(9).toString("base64url");
  const barberPassword = await bcrypt.hash(cashierPlain, 12);
  await prisma.user.upsert({
    where: { email: "cashier@escape.com" },
    update: {},
    create: {
      email: "cashier@escape.com",
      password: barberPassword,
      name: "Co-Owner",
      role: "CASHIER",
      barberId: barber.id,
    },
  });
  console.log(`Sample cashier account: cashier@escape.com / ${cashierPlain}`);

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
