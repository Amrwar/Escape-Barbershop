import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";
import { DEFAULT_SEGMENT_RULES, segmentCounts, summarise } from "@/lib/segments";

/**
 * How many customers are in each group right now.
 *
 * Worked out from the visits every time it is asked: a segment is a rule, not a
 * stored list, so nothing here can quietly go out of date.
 */
export async function GET() {
  try {
    await requireOwner();

    const visits = await prisma.visit.findMany({ select: { customerId: true, visitAt: true, total: true } });
    const customers = summarise(visits);

    return NextResponse.json({
      rules: DEFAULT_SEGMENT_RULES,
      counts: segmentCounts(customers),
      customersWithVisits: customers.length,
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[segments]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
