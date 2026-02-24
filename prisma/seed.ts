import { PrismaClient, CommissionType } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const SERVICES = [
  "Hair cut",
  "Beard cut",
  "curly or hair dryer",
  "kids Hair cut",
  "nose and ear wax",
  "whole wax",
  "hair dye",
  "beard dye",
  "rinsage",
  "hair protein",
  "face string",
  "american straightening",
  "silver dye",
  "beard henna",
  "dandruff removal",
  "topic thickening",
  "oil bath argan",
  "oil bath loreal",
  "hair henna",
  "oil bath beard",
  "external hair dryer",
  "groom external package",
  "groom internal package",
  "extras",
  "highlights",
  "hair dryer for tall hair",
  "douglas",
  "hair dryer for beard",
];

async function main() {
  console.log("Seeding database...");

  // Upsert services
  for (const name of SERVICES) {
    await prisma.service.upsert({
      where: { name },
      update: {},
      create: {
        name,
        defaultPrice: 0,
        isActive: true,
      },
    });
  }
  console.log(`Seeded ${SERVICES.length} services`);

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
