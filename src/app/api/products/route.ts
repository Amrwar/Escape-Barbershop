import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireOwner } from "@/lib/auth";
import { getBalances } from "@/lib/stock";

// GET /api/products?includeInactive=1 — catalogue with live balances per location
export async function GET(req: NextRequest) {
  try {
    await requireAuth();
    const includeInactive = req.nextUrl.searchParams.get("includeInactive") === "1";

    const products = await prisma.product.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { name: "asc" },
    });
    const balances = await getBalances(products.map((p) => p.id));

    return NextResponse.json(
      products.map((p) => {
        const b = balances.get(p.id);
        const main = b?.main ?? 0;
        const branch = b?.branch ?? 0;
        return {
          id: p.id,
          name: p.name,
          unit: p.unit,
          costPrice: p.costPrice,
          isActive: p.isActive,
          mainQty: main,
          branchQty: branch,
          totalQty: main + branch,
          totalValue: (main + branch) * p.costPrice,
        };
      })
    );
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized"))
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[products GET]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireOwner();
    const { name, unit, costPrice } = await req.json();
    if (!name || !String(name).trim())
      return NextResponse.json({ error: "Name is required" }, { status: 400 });

    const product = await prisma.product.create({
      data: {
        name: String(name).trim(),
        unit: String(unit ?? "pcs").trim() || "pcs",
        costPrice: Number.isFinite(parseFloat(costPrice)) ? parseFloat(costPrice) : 0,
      },
    });
    return NextResponse.json(product, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized"))
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (err instanceof Error && err.message.includes("Unique constraint"))
      return NextResponse.json({ error: "name_exists" }, { status: 409 });
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
