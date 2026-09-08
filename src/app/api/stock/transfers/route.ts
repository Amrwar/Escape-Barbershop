import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { stockTransferSchema } from "@/lib/validations";
import { getBalances } from "@/lib/stock";
import { recordAudit } from "@/lib/audit";

// Issue notes: stock moving between the main store and the branch. The cashier
// can raise one, because issuing goods to the floor is a daily-operations job.
export async function GET(req: NextRequest) {
  try {
    await requireAuth();
    const { searchParams } = req.nextUrl;
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const transfers = await prisma.stockTransfer.findMany({
      where:
        from || to
          ? { date: { ...(from && { gte: new Date(from) }), ...(to && { lte: new Date(to) }) } }
          : {},
      orderBy: { date: "desc" },
      include: { items: { include: { product: { select: { id: true, name: true, unit: true } } } } },
    });
    return NextResponse.json(transfers);
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized"))
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[transfers GET]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authSession = await requireAuth();
    const data = stockTransferSchema.parse(await req.json());

    if (data.fromLocation === data.toLocation) {
      return NextResponse.json({ error: "same_location" }, { status: 400 });
    }

    // A transfer can never issue more than the source location holds.
    const productIds = data.items.map((i) => i.productId);
    const balances = await getBalances(productIds);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true },
    });
    const nameOf = new Map(products.map((p) => [p.id, p.name]));

    const short = data.items
      .map((i) => {
        const b = balances.get(i.productId);
        const available = data.fromLocation === "MAIN" ? b?.main ?? 0 : b?.branch ?? 0;
        return { name: nameOf.get(i.productId) ?? i.productId, available, requested: i.quantity };
      })
      .filter((r) => r.requested > r.available);

    if (short.length > 0) {
      return NextResponse.json({ error: "insufficient_stock", short }, { status: 409 });
    }

    const date = new Date(data.date);
    const transfer = await prisma.$transaction(async (tx) => {
      const created = await tx.stockTransfer.create({
        data: {
          number: data.number?.trim() || null,
          date,
          fromLocation: data.fromLocation,
          toLocation: data.toLocation,
          notes: data.notes?.trim() || null,
          items: { create: data.items.map((i) => ({ productId: i.productId, quantity: i.quantity })) },
        },
        include: { items: true },
      });

      await tx.stockMovement.createMany({
        data: created.items.flatMap((i) => [
          {
            productId: i.productId,
            date,
            location: data.fromLocation,
            type: "TRANSFER_OUT" as const,
            quantity: -i.quantity,
            refId: created.id,
          },
          {
            productId: i.productId,
            date,
            location: data.toLocation,
            type: "TRANSFER_IN" as const,
            quantity: i.quantity,
            refId: created.id,
          },
        ]),
      });

      return created;
    });

    await recordAudit(authSession, {
      action: "CREATE",
      entity: "STOCK_TRANSFER",
      entityId: transfer.id,
      summary: `${data.items.length} product(s) ${data.fromLocation} to ${data.toLocation}`,
      details: { number: transfer.number, items: data.items },
    });

    return NextResponse.json(transfer, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized"))
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[transfers POST]", err);
    return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  }
}
