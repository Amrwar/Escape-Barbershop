import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";

// POST /api/settings/discount-pin — verify a PIN (any logged-in user)
export async function POST(req: NextRequest) {
  try {
    const { pin } = await req.json();
    const setting = await prisma.setting.findUnique({ where: { key: "discount_pin" } });
    const valid = setting?.value === String(pin ?? "");
    return NextResponse.json({ valid });
  } catch {
    return NextResponse.json({ valid: false });
  }
}

// PATCH /api/settings/discount-pin — change the PIN (owner only)
export async function PATCH(req: NextRequest) {
  try {
    await requireOwner();
    const { pin } = await req.json();
    if (!pin || String(pin).trim().length < 4) {
      return NextResponse.json({ error: "PIN must be at least 4 characters" }, { status: 400 });
    }
    await prisma.setting.upsert({
      where: { key: "discount_pin" },
      update: { value: String(pin).trim() },
      create: { key: "discount_pin", value: String(pin).trim() },
    });
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
