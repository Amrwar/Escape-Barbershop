import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";
import { salarySettingsSchema } from "@/lib/validations";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireOwner();
    const body = await req.json();
    const data = salarySettingsSchema.parse(body);

    const settings = await prisma.barberSalarySettings.upsert({
      where: { barberId: params.id },
      update: data,
      create: {
        barberId: params.id,
        ...data,
      },
    });
    return NextResponse.json(settings);
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  }
}
