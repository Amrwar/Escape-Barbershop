import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

// GET /api/inventory?from=&to=
// Returns per-service usage counts and quantities for the given period
export async function GET(req: NextRequest) {
  try {
    await requireAuth();
    const { searchParams } = req.nextUrl;
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const items = await prisma.visitItem.findMany({
      where: {
        visit: {
          ...(from || to
            ? {
                visitAt: {
                  ...(from && { gte: new Date(from) }),
                  ...(to && { lte: new Date(to) }),
                },
              }
            : {}),
        },
      },
      include: {
        service: { select: { id: true, name: true, arabicName: true } },
      },
    });

    // Aggregate by service
    const map = new Map<
      string,
      { serviceId: string; name: string; arabicName: string | null; count: number; totalQty: number }
    >();
    for (const item of items) {
      const e = map.get(item.serviceId);
      if (e) {
        e.count += 1;
        e.totalQty += item.quantity;
      } else {
        map.set(item.serviceId, {
          serviceId: item.serviceId,
          name: item.service.name,
          arabicName: item.service.arabicName,
          count: 1,
          totalQty: item.quantity,
        });
      }
    }

    const result = Array.from(map.values()).sort((a, b) => b.totalQty - a.totalQty);
    return NextResponse.json({ items: result, total: items.reduce((s, i) => s + i.quantity, 0) });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized"))
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
