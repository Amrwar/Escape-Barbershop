import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { CUSTOMER_FACING_BARBER } from "@/lib/barbers";
import { ratingSummary } from "@/lib/reviews";

/**
 * Read fresh every time. This route takes no session, so Next would otherwise
 * render it once at build and serve that copy from the edge — and the shop's
 * own changes (a barber hidden, a price, an offer, a rating) would not reach
 * the app until the next deploy.
 */
export const dynamic = "force-dynamic";


/**
 * What people have said about one barber, for their profile in the app.
 *
 * Public, like the rest of the profile — this is the shop's shop window. Only
 * first names go out with it: a review should not tell a stranger who else has
 * their hair cut here.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    // Someone who is not shown in the app has no public profile to review.
    const barber = await prisma.barber.findFirst({
      where: { id: params.id, isActive: true, ...CUSTOMER_FACING_BARBER },
      select: { id: true },
    });
    if (!barber) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const reviews = await prisma.review.findMany({
      where: { barberId: barber.id, hiddenAt: null },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, rating: true, comment: true, createdAt: true, customer: { select: { name: true } } },
    });

    return NextResponse.json({
      summary: ratingSummary(reviews),
      reviews: reviews
        .filter((r) => r.comment)
        .map((r) => ({
          id: r.id,
          rating: r.rating,
          comment: r.comment,
          createdAt: r.createdAt,
          name: r.customer.name.trim().split(/\s+/)[0],
        })),
    });
  } catch (err) {
    console.error("[customer/barber-reviews]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
