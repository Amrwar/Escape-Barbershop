import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";

// The activity trail. Owner-only: it exists to watch the till, so the till
// cannot read it.
export async function GET(req: NextRequest) {
  try {
    await requireOwner();
    const { searchParams } = req.nextUrl;
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const entity = searchParams.get("entity");
    const action = searchParams.get("action");
    const userId = searchParams.get("userId");
    const take = Math.min(parseInt(searchParams.get("take") ?? "200", 10) || 200, 500);

    const where = {
      ...(from || to
        ? { at: { ...(from && { gte: new Date(from) }), ...(to && { lte: new Date(to) }) } }
        : {}),
      ...(entity ? { entity } : {}),
      ...(action ? { action } : {}),
      ...(userId ? { userId } : {}),
    };

    const [rows, grouped] = await Promise.all([
      prisma.auditLog.findMany({ where, orderBy: { at: "desc" }, take }),
      prisma.auditLog.groupBy({ by: ["action"], where, _count: { id: true } }),
    ]);

    const counts = { CREATE: 0, UPDATE: 0, DELETE: 0 } as Record<string, number>;
    for (const g of grouped) counts[g.action] = g._count.id;

    return NextResponse.json({
      rows: rows.map((r) => ({
        id: r.id,
        at: r.at,
        userName: r.userName,
        userRole: r.userRole,
        action: r.action,
        entity: r.entity,
        entityId: r.entityId,
        summary: r.summary,
        amount: r.amount,
        details: r.details,
      })),
      counts,
      total: rows.length,
      truncated: rows.length === take,
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[audit GET]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
