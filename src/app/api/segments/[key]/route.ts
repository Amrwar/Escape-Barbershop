import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";
import { SEGMENT_KEYS, membersOf, summarise, type SegmentKey } from "@/lib/segments";

/**
 * Who is in one group, with enough to act on: a name, a phone number, how often
 * they have been in, what they have spent, and whether they have the app — the
 * last of which decides whether the shop can message them for nothing or has to
 * pick up the phone.
 */
export async function GET(_req: NextRequest, { params }: { params: { key: string } }) {
  try {
    await requireOwner();

    if (!SEGMENT_KEYS.includes(params.key as SegmentKey)) {
      return NextResponse.json({ error: "No such group" }, { status: 404 });
    }
    const key = params.key as SegmentKey;

    const visits = await prisma.visit.findMany({ select: { customerId: true, visitAt: true, total: true } });
    const members = membersOf(summarise(visits), key);

    const ids = members.map((m) => m.customerId);
    const [customers, reachable] = await Promise.all([
      prisma.customer.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, phone: true } }),
      prisma.pushSubscription.findMany({ where: { customerId: { in: ids } }, select: { customerId: true } }),
    ]);

    const byId = new Map(customers.map((c) => [c.id, c]));
    const withApp = new Set(reachable.map((r) => r.customerId));

    return NextResponse.json({
      key,
      total: members.length,
      reachable: members.filter((m) => withApp.has(m.customerId)).length,
      members: members.slice(0, 500).map((member) => ({
        id: member.customerId,
        name: byId.get(member.customerId)?.name ?? "—",
        phone: byId.get(member.customerId)?.phone ?? null,
        visits: member.visits,
        spend: member.spend,
        lastVisitAt: new Date(member.lastVisitAt),
        hasApp: withApp.has(member.customerId),
      })),
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[segments/key]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
