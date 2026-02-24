import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireOwner } from "@/lib/auth";

const KEYS = ["shop_name", "shop_phone", "shop_address", "receipt_footer", "shop_logo"] as const;

export async function GET() {
  try {
    await requireAuth();
    const rows = await prisma.setting.findMany({ where: { key: { in: [...KEYS] } } });
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    return NextResponse.json({
      shopName: map["shop_name"] ?? "Escape Barbershop",
      shopPhone: map["shop_phone"] ?? null,
      shopAddress: map["shop_address"] ?? null,
      receiptFooter: map["receipt_footer"] ?? null,
      shopLogo: map["shop_logo"] ?? null,
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await requireOwner();
    const body = await req.json();
    const fields: Record<string, string> = {
      ...(body.shopName !== undefined && { shop_name: body.shopName }),
      ...(body.shopPhone !== undefined && { shop_phone: body.shopPhone ?? "" }),
      ...(body.shopAddress !== undefined && { shop_address: body.shopAddress ?? "" }),
      ...(body.receiptFooter !== undefined && { receipt_footer: body.receiptFooter ?? "" }),
    };
    await Promise.all(
      Object.entries(fields).map(([key, value]) =>
        prisma.setting.upsert({
          where: { key },
          update: { value },
          create: { key, value },
        })
      )
    );
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
