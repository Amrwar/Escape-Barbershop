import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";
import { salarySettingsSchema } from "@/lib/validations";
import { recordAudit } from "@/lib/audit";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authSession = await requireOwner();
    const body = await req.json();
    const data = salarySettingsSchema.parse(body);

    const [barber, before] = await Promise.all([
      prisma.barber.findUnique({ where: { id: params.id }, select: { name: true } }),
      prisma.barberSalarySettings.findUnique({ where: { barberId: params.id } }),
    ]);

    const settings = await prisma.barberSalarySettings.upsert({
      where: { barberId: params.id },
      update: data,
      create: {
        barberId: params.id,
        ...data,
      },
    });
    await recordAudit(authSession, {
      action: "UPDATE",
      entity: "BARBER",
      entityId: params.id,
      amount: data.baseSalary,
      summary: `Salary settings for ${barber?.name ?? params.id}: base ${data.baseSalary.toFixed(
        2
      )}, commission ${data.commissionValue} ${data.commissionType}`,
      details: before
        ? { baseSalary: before.baseSalary, commissionType: before.commissionType, commissionValue: before.commissionValue }
        : null,
    });

    return NextResponse.json(settings);
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  }
}
