import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { getBalances } from "@/lib/stock";

// Live stock per product, split main store vs. branch, valued at cost.
export async function GET(req: NextRequest) {
  try {
    await requireAuth();
    const includeInactive = req.nextUrl.searchParams.get("includeInactive") === "1";

    const products = await prisma.product.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { name: "asc" },
    });
    const balances = await getBalances(products.map((p) => p.id));

    const rows = products.map((p) => {
      const b = balances.get(p.id);
      const main = b?.main ?? 0;
      const branch = b?.branch ?? 0;
      return {
        productId: p.id,
        name: p.name,
        unit: p.unit,
        costPrice: p.costPrice,
        isActive: p.isActive,
        main,
        branch,
        total: main + branch,
        value: (main + branch) * p.costPrice,
      };
    });

    return NextResponse.json({
      rows,
      totals: {
        mainValue: rows.reduce((s, r) => s + r.main * r.costPrice, 0),
        branchValue: rows.reduce((s, r) => s + r.branch * r.costPrice, 0),
        totalValue: rows.reduce((s, r) => s + r.value, 0),
      },
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized"))
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[stock balances]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
