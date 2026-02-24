import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireOwner } from "@/lib/auth";
import { barberSchema } from "@/lib/validations";

export async function GET(req: NextRequest) {
  try {
    await requireAuth();
    const activeOnly = req.nextUrl.searchParams.get("active") === "true";

    const barbers = await prisma.barber.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      orderBy: { name: "asc" },
      include: {
        salarySettings: true,
        _count: { select: { visits: true } },
      },
    });
    return NextResponse.json(barbers);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireOwner();
    const body = await req.json();
    const data = barberSchema.parse(body);

    const barber = await prisma.barber.create({
      data: {
        name: data.name,
        phone: data.phone || null,
        isActive: data.isActive ?? true,
        salarySettings: {
          create: {
            baseSalary: 0,
            commissionType: "PERCENT",
            commissionValue: 0,
          },
        },
      },
      include: { salarySettings: true },
    });
    return NextResponse.json(barber, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  }
}
