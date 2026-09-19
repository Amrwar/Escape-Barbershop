import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCustomer } from "@/lib/auth";

/**
 * Their own haircuts, as the shop recorded them.
 *
 * The shop has years of this and the customer has never been able to see any of
 * it: what they had, who did it, what it cost, when. It is their record as much
 * as the shop's.
 *
 * Deliberately read-only and deliberately narrow. It answers "what did I have
 * last time and what did it cost" and nothing else — no tips, no commission, no
 * discount the shop chose to give, no cash-versus-card breakdown. Those are the
 * shop's business and none of them help a customer remember their haircut.
 */

const PAGE = 20;

export async function GET(req: NextRequest) {
  try {
    const session = await requireCustomer();
    const before = req.nextUrl.searchParams.get("before");

    const visits = await prisma.visit.findMany({
      where: {
        customerId: session.user.customerId,
        ...(before ? { visitAt: { lt: new Date(before) } } : {}),
      },
      orderBy: { visitAt: "desc" },
      // One more than a page, to know whether there is another without counting
      // six thousand rows to find out.
      take: PAGE + 1,
      select: {
        id: true,
        visitAt: true,
        total: true,
        barber: { select: { id: true, name: true, photo: true } },
        items: {
          select: {
            quantity: true,
            priceAtTime: true,
            service: { select: { name: true, arabicName: true } },
          },
        },
        products: { select: { quantity: true, name: true } },
        review: { select: { rating: true } },
      },
    });

    const page = visits.slice(0, PAGE);

    return NextResponse.json({
      visits: page.map((v) => ({
        id: v.id,
        visitAt: v.visitAt,
        total: v.total,
        barber: v.barber,
        rating: v.review?.rating ?? null,
        services: v.items.map((i) => ({
          name: i.service?.name ?? null,
          arabicName: i.service?.arabicName ?? null,
          quantity: i.quantity,
          price: i.priceAtTime,
        })),
        products: v.products.map((p) => ({ name: p.name, quantity: p.quantity })),
      })),
      // What to ask for next, or null at the end of their history.
      nextBefore: visits.length > PAGE ? page[page.length - 1]?.visitAt ?? null : null,
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[customer/visits]", err);
    return NextResponse.json({ error: "Could not load that" }, { status: 400 });
  }
}
