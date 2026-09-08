import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";
import { stockCountSchema } from "@/lib/validations";
import { getBalances } from "@/lib/stock";
import { round2 } from "@/lib/finance";
import { recordAudit } from "@/lib/audit";

// Stocktake. Saving one writes an ADJUSTMENT movement for every difference, so
// the ledger always matches what was actually counted.
//
// The value of a shortage is reported, never posted as an expense: purchases are
// already expensed when they are paid, so expensing shrinkage as well would
// count the same money twice.
export async function GET(req: NextRequest) {
  try {
    await requireOwner();
    const { searchParams } = req.nextUrl;
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const counts = await prisma.stockCount.findMany({
      where:
        from || to
          ? { date: { ...(from && { gte: new Date(from) }), ...(to && { lte: new Date(to) }) } }
          : {},
      orderBy: { date: "desc" },
      include: { items: { include: { product: { select: { id: true, name: true, unit: true } } } } },
    });

    return NextResponse.json(
      counts.map((c) => {
        const diffValue = c.items.reduce(
          (s, i) => s + (i.countedQty - i.systemQty) * i.unitCost,
          0
        );
        return {
          ...c,
          itemCount: c.items.length,
          differenceValue: round2(diffValue),
        };
      })
    );
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized"))
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[stock counts GET]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authSession = await requireOwner();
    const data = stockCountSchema.parse(await req.json());
    const date = new Date(data.date);

    const productIds = data.items.map((i) => i.productId);
    const [balances, products] = await Promise.all([
      getBalances(productIds),
      prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, costPrice: true },
      }),
    ]);
    const costOf = new Map(products.map((p) => [p.id, p.costPrice]));

    const rows = data.items.map((i) => {
      const b = balances.get(i.productId);
      const systemQty = data.location === "MAIN" ? b?.main ?? 0 : b?.branch ?? 0;
      return {
        productId: i.productId,
        systemQty,
        countedQty: i.countedQty,
        unitCost: costOf.get(i.productId) ?? 0,
      };
    });

    const count = await prisma.$transaction(async (tx) => {
      const created = await tx.stockCount.create({
        data: {
          date,
          location: data.location,
          notes: data.notes?.trim() || null,
          items: { create: rows },
        },
        include: { items: true },
      });

      const adjustments = created.items
        .filter((i) => i.countedQty !== i.systemQty)
        .map((i) => ({
          productId: i.productId,
          date,
          location: data.location,
          type: "ADJUSTMENT" as const,
          quantity: round2(i.countedQty - i.systemQty),
          unitCost: i.unitCost,
          refId: created.id,
        }));
      if (adjustments.length > 0) {
        await tx.stockMovement.createMany({ data: adjustments });
      }

      return created;
    });

    const differenceValue = round2(
      count.items.reduce((s, i) => s + (i.countedQty - i.systemQty) * i.unitCost, 0)
    );

    await recordAudit(authSession, {
      action: "CREATE",
      entity: "STOCK_COUNT",
      entityId: count.id,
      amount: differenceValue,
      summary: `Stocktake at ${data.location}, ${count.items.length} product(s), difference ${differenceValue.toFixed(
        2
      )}`,
    });

    return NextResponse.json({ ...count, differenceValue }, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized"))
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[stock counts POST]", err);
    return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  }
}
