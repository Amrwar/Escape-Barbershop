import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBarber } from "@/lib/auth";
import { ratingSummary } from "@/lib/reviews";

/**
 * What a barber's own customers have said about them.
 *
 * Their rating, and the comments, with first names only — the same words the
 * app shows, so a barber is never surprised by what a customer can read. A
 * review the owner has hidden is not here either: it counts for nothing, and
 * showing it would only reopen the argument.
 */
export async function GET() {
  try {
    const session = await requireBarber();

    const reviews = await prisma.review.findMany({
      where: { barberId: session.user.barberId, hiddenAt: null },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { id: true, rating: true, comment: true, createdAt: true, customer: { select: { name: true } } },
    });

    return NextResponse.json({
      summary: ratingSummary(reviews),
      reviews: reviews.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt,
        name: r.customer.name.trim().split(/\s+/)[0],
      })),
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
