import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCustomer } from "@/lib/auth";
import { reviewSchema } from "@/lib/validations";
import { canReview, visitAsCut } from "@/lib/reviews";

/**
 * A customer's own reviews: what they have said, and what they could still say
 * something about. The shop's moderation lives elsewhere; from here a customer
 * only ever reaches their own haircuts.
 *
 * A cut reaches them two ways — booked, which is an appointment, or walked in,
 * which is a visit. The shop does vastly more of the second, so a review that
 * only understood appointments was a review nobody here could leave.
 */

/** What a cut looks like once it has been flattened for the app. */
interface Reviewable {
  appointmentId: string | null;
  visitId: string | null;
  startAt: Date;
  barber: { id: string; name: string; photo: string | null } | null;
  services: string[];
  canReview: boolean;
  review: { rating: number; comment: string | null; createdAt: Date } | null;
}

/** Everything they may review, with their review attached where they wrote one. */
export async function GET() {
  try {
    const session = await requireCustomer();
    const customerId = session.user.customerId;
    const now = Date.now();

    const reviewFields = { select: { rating: true, comment: true, createdAt: true, hiddenAt: true } };

    const [appointments, visits] = await Promise.all([
      prisma.appointment.findMany({
        where: { customerId, status: { in: ["COMPLETED", "COMPLETED_UNPAID"] } },
        orderBy: { startAt: "desc" },
        take: 20,
        select: {
          id: true,
          startAt: true,
          endAt: true,
          status: true,
          barber: { select: { id: true, name: true, photo: true } },
          services: { select: { serviceName: true } },
          review: reviewFields,
        },
      }),
      // A walk-in already rung up. The ones with a booking behind them are left
      // out, or the same cut would appear twice asking to be rated twice.
      prisma.visit.findMany({
        where: { customerId, appointment: { is: null } },
        orderBy: { visitAt: "desc" },
        take: 20,
        select: {
          id: true,
          visitAt: true,
          barber: { select: { id: true, name: true, photo: true } },
          items: { select: { service: { select: { name: true } } } },
          review: reviewFields,
        },
      }),
    ]);

    // A hidden review still reads as theirs: they wrote it, and being told it
    // was taken down would only start an argument the shop cannot win.
    const asTheirs = (r: { rating: number; comment: string | null; createdAt: Date } | null) =>
      r ? { rating: r.rating, comment: r.comment, createdAt: r.createdAt } : null;

    const cuts: Reviewable[] = [
      ...appointments.map((a) => ({
        appointmentId: a.id,
        visitId: null,
        startAt: a.startAt,
        barber: a.barber,
        services: a.services.map((s) => s.serviceName),
        canReview: canReview(a, now),
        review: asTheirs(a.review),
      })),
      ...visits.map((v) => ({
        appointmentId: null,
        visitId: v.id,
        startAt: v.visitAt,
        barber: v.barber,
        services: v.items.map((i) => i.service?.name).filter((n): n is string => !!n),
        canReview: canReview(visitAsCut(v), now),
        review: asTheirs(v.review),
      })),
    ];

    return NextResponse.json(
      cuts
        .filter((c) => c.canReview || c.review)
        .sort((a, b) => b.startAt.getTime() - a.startAt.getTime())
        .slice(0, 20)
    );
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

/**
 * Leave a review, or change one. Their own cut, finished, inside the window —
 * anything else is refused, whatever the client sends.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireCustomer();
    const data = reviewSchema.parse(await req.json());

    if (!data.appointmentId === !data.visitId) {
      return NextResponse.json({ error: "Which cut?" }, { status: 400 });
    }

    // Whose cut it was and when it ended, asked the same way of both kinds.
    const cut = data.appointmentId
      ? await prisma.appointment
          .findUnique({
            where: { id: data.appointmentId },
            select: { id: true, customerId: true, barberId: true, status: true, endAt: true },
          })
          .then((a) => (a ? { ...a, key: { appointmentId: a.id }, when: a } : null))
      : await prisma.visit
          .findUnique({
            where: { id: data.visitId! },
            select: { id: true, customerId: true, barberId: true, visitAt: true },
          })
          .then((v) => (v ? { ...v, key: { visitId: v.id }, when: visitAsCut(v) } : null));

    // The same answer either way: a customer must not be able to learn which
    // ids exist by watching the error change.
    if (!cut || cut.customerId !== session.user.customerId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!canReview(cut.when)) {
      return NextResponse.json({ error: "This visit can no longer be reviewed" }, { status: 409 });
    }

    const comment = data.comment?.trim() || null;
    const review = await prisma.review.upsert({
      where: cut.key,
      create: {
        ...cut.key,
        customerId: session.user.customerId,
        barberId: cut.barberId,
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
