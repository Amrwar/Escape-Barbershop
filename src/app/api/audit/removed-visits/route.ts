import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";

/**
 * Removals that happened before the activity trail existed.
 *
 * Visits are numbered 1..N inside a drawer session, so a number that is missing
 * from that run is a visit that existed and was deleted. This recovers the fact,
 * the day and the session — not the amount, the services or who did it, because
 * nothing recorded that at the time.
 *
 * A repeated number is the same story from the other side: the old numbering
 * used count+1, so after a deletion the next visit was handed a number that was
 * already used. Both signals are reported.
 */
export async function GET(req: NextRequest) {
  try {
    await requireOwner();
    const { searchParams } = req.nextUrl;
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const sessions = await prisma.cashDrawerSession.findMany({
      where:
        from || to
          ? { openedAt: { ...(from && { gte: new Date(from) }), ...(to && { lte: new Date(to) }) } }
          : {},
      orderBy: { openedAt: "desc" },
      include: {
        openedBy: { select: { name: true } },
        visits: { select: { sessionSequence: true } },
      },
    });

    const findings = [];
    let removedTotal = 0;
    let repeatedTotal = 0;

    for (const s of sessions) {
      const seqs = s.visits
        .map((v) => v.sessionSequence)
        .filter((n): n is number => n !== null);
      if (seqs.length === 0) continue;

      const highest = Math.max(...seqs);
      const seen = new Map<number, number>();
      for (const n of seqs) seen.set(n, (seen.get(n) ?? 0) + 1);

      const missing: number[] = [];
      for (let i = 1; i <= highest; i++) if (!seen.has(i)) missing.push(i);
      const repeated: number[] = [];
      seen.forEach((count, num) => { if (count > 1) repeated.push(num); });
      repeated.sort((a, b) => a - b);

      if (missing.length === 0 && repeated.length === 0) continue;

      removedTotal += missing.length;
      repeatedTotal += repeated.length;
      findings.push({
        sessionId: s.id,
        openedAt: s.openedAt,
        closedAt: s.closedAt,
        openedBy: s.openedBy?.name ?? "—",
        visitCount: seqs.length,
        highestNumber: highest,
        missing,
        repeated,
      });
    }

    // Deleting a drawer session unlinks its visits but leaves their sequence
    // number, so a numbered visit with no session means its session was deleted.
    const orphaned = await prisma.visit.findMany({
      where: {
        sessionId: null,
        sessionSequence: { not: null },
        ...(from || to
          ? { visitAt: { ...(from && { gte: new Date(from) }), ...(to && { lte: new Date(to) }) } }
          : {}),
      },
      select: { id: true, visitAt: true, total: true, sessionSequence: true },
      orderBy: { visitAt: "asc" },
    });

    const orphanDays = new Map<string, { day: string; visits: number; total: number }>();
    for (const v of orphaned) {
      const day = v.visitAt.toISOString().slice(0, 10);
      const e = orphanDays.get(day) ?? { day, visits: 0, total: 0 };
      e.visits += 1;
      e.total += v.total;
      orphanDays.set(day, e);
    }

    return NextResponse.json({
      findings,
      deletedSessions: Array.from(orphanDays.values()),
      summary: {
        sessionsScanned: sessions.length,
        sessionsAffected: findings.length,
        removedVisits: removedTotal,
        repeatedNumbers: repeatedTotal,
        orphanedVisits: orphaned.length,
      },
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[removed-visits]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
