import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";

/**
 * Taking a review off the app, or putting it back. The owner's decision alone,
 * and always written down: a shop that can quietly delete criticism is a shop
 * whose rating means nothing, so the row stays and the audit log remembers who
 * hid it.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authSession = await requireOwner();
    const body = await req.json();
    const hidden = Boolean(body?.hidden);

    const review = await prisma.review.findUnique({
      where: { id: params.id },
      select: { id: true, rating: true, comment: true, barber: { select: { name: true } } },
    });
    if (!review) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const updated = await prisma.review.update({
      where: { id: params.id },
      data: hidden
        ? { hiddenAt: new Date(), hiddenById: authSession.user.id }
        : { hiddenAt: null, hiddenById: null },
      select: { id: true, rating: true, comment: true, hiddenAt: true },
    });

    await recordAudit(authSession, {
      action: "UPDATE",
      entity: "REVIEW",
      entityId: review.id,
      summary: `${hidden ? "Hid" : "Restored"} a ${review.rating}-star review of ${review.barber?.name ?? "the shop"}`,
      details: { comment: review.comment },
    });

    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
