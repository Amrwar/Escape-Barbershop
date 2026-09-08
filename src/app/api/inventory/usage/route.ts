import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { isStockLocation } from "@/lib/stock";

export async function GET(req: NextRequest) {
  try {
    await requireAuth();
    const { searchParams } = req.nextUrl;
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const productId = searchParams.get("productId");

    const usages = await prisma.productUsage.findMany({
      where: {
        ...(productId && { productId }),
        ...(from || to
          ? {
              date: {
                ...(from && { gte: new Date(from) }),
                ...(to && { lte: new Date(to) }),
              },
            }
          : {}),
      },
      include: { product: { select: { name: true, unit: true } } },
      orderBy: { date: "desc" },
    });

    return NextResponse.json(usages);
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized"))
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// Consumption on the floor. It writes a matching USAGE movement so the branch
// balance drops with it.
export async function POST(req: NextRequest) {
  try {
    await requireAuth();
    const { productId, quantity, date, notes, location } = await req.json();
    if (!productId || !quantity || !date)
      return NextResponse.json(
        { error: "productId, quantity, and date are required" },
        { status: 400 }
      );
    const qty = parseFloat(quantity);
    if (!(qty > 0))
      return NextResponse.json({ error: "Quantity must be greater than 0" }, { status: 400 });

    const loc = isStockLocation(location) ? location : "BRANCH";
    const when = new Date(date);

    const usage = await prisma.$transaction(async (tx) => {
      const created = await tx.productUsage.create({
        data: {
          productId,
          quantity: qty,
          location: loc,
          date: when,
          notes: notes?.trim() || null,
        },
        include: { product: { select: { name: true, unit: true } } },
      });
      await tx.stockMovement.create({
        data: {
          productId,
          date: when,
          location: loc,
          type: "USAGE",
          quantity: -qty,
          refId: created.id,
        },
      });
      return created;
    });

    return NextResponse.json(usage, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized"))
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Failed to log usage" }, { status: 500 });
  }
}
