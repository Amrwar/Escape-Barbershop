import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { ratingSummary } from "@/lib/reviews";

/**
 * What customers have said, for the shop. Everyone on the staff may read it —
 * a barber's rating is not a secret from the person who works the next chair —
 * and hiding one is the owner's job, in the route next door.
 */
export async function GET(req: NextRequest) {
  try {
    await requireAuth();

    const barberId = req.nextUrl.searchParams.get("barberId");
    const reviews = await prisma.review.findMany({
      where: barberId ? { barberId } : {},
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        rating: true,
        comment: true,
        createdAt: true,
        hiddenAt: true,
        barber: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true } },
        appointment: { select: { id: true, startAt: true } },
      },
    });

    // The shop sees hidden reviews too, but they count for nothing: the average
    // it reads is the average the customers are shown.
    return NextResponse.json({
      reviews,
      summary: ratingSummary(reviews.filter((r) => !r.hiddenAt)),
      hiddenCount: reviews.filter((r) => r.hiddenAt).length,
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
