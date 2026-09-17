import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCustomer } from "@/lib/auth";
import { reviewSchema } from "@/lib/validations";
import { canReview } from "@/lib/reviews";

/**
 * A customer's own reviews: what they have said, and what they could still say
 * something about. The shop's moderation lives elsewhere; from here a customer
 * only ever reaches their own haircuts.
 */

/** Everything they may review, with their review attached where they wrote one. */
export async function GET() {
  try {
    const session = await requireCustomer();

    const appointments = await prisma.appointment.findMany({
      where: {
        customerId: session.user.customerId,
        status: { in: ["COMPLETED", "COMPLETED_UNPAID"] },
      },
      orderBy: { startAt: "desc" },
      take: 20,
      select: {
        id: true,
        startAt: true,
        endAt: true,
        status: true,
        barber: { select: { id: true, name: true, photo: true } },
        services: { select: { serviceName: true } },
        review: { select: { rating: true, comment: true, createdAt: true, hiddenAt: true } },
      },
    });

    const now = Date.now();
    return NextResponse.json(
      appointments
        .filter((a) => canReview(a, now) || a.review)
        .map((a) => ({
          appointmentId: a.id,
          startAt: a.startAt,
          barber: a.barber,
          services: a.services.map((s) => s.serviceName),
          canReview: canReview(a, now),
          // A hidden review still reads as theirs: they wrote it, and being told
          // it was taken down would only start an argument the shop cannot win.
          review: a.review ? { rating: a.review.rating, comment: a.review.comment, createdAt: a.review.createdAt } : null,
        }))
    );
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

/**
 * Leave a review, or change one. Their own appointment, finished, inside the
 * window — anything else is refused, whatever the client sends.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireCustomer();
    const data = reviewSchema.parse(await req.json());

    const appointment = await prisma.appointment.findUnique({
      where: { id: data.appointmentId },
      select: { id: true, customerId: true, barberId: true, status: true, endAt: true },
    });

    // The same answer either way: a customer must not be able to learn which
    // appointment ids exist by watching the error change.
    if (!appointment || appointment.customerId !== session.user.customerId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!canReview(appointment)) {
      return NextResponse.json({ error: "This visit can no longer be reviewed" }, { status: 409 });
    }

    const comment = data.comment?.trim() || null;
    const review = await prisma.review.upsert({
      where: { appointmentId: appointment.id },
      create: {
        appointmentId: appointment.id,
        customerId: session.user.customerId,
        barberId: appointment.barberId,
        rating: data.rating,
        comment,
      },
      // Writing it again is a change of mind, not a second review — and it comes
      // back out of hiding, because it is new words the shop has not judged.
      update: { rating: data.rating, comment, hiddenAt: null, hiddenById: null },
      select: { id: true, rating: true, comment: true, createdAt: true },
    });

    return NextResponse.json(review, { status: 201 });
  } catch (err: unknown) {
    if (err && typeof err === "object" && "issues" in err) {
      return NextResponse.json({ error: "Please choose between one and five stars" }, { status: 400 });
    }
    console.error("[customer/reviews]", err);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
