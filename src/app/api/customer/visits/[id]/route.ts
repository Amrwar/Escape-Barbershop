import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCustomer } from "@/lib/auth";

/**
 * One haircut, as a receipt the customer can keep.
 *
 * The shop has always been able to print, WhatsApp or PDF a receipt from the
 * till; the customer has never been able to get one back afterwards. This is
 * the same visit, told from their side.
 *
 * Same line as the list before it: what they had and what it cost, and none of
 * the shop's books. No tip, no discount the owner chose to give, no split
 * between cash and card. The shop's name and number are here because a receipt
 * without them is not a receipt.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireCustomer();

    const visit = await prisma.visit.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        customerId: true,
        visitAt: true,
        total: true,
        sessionSequence: true,
        barber: { select: { name: true } },
        items: {
          select: {
            quantity: true,
            priceAtTime: true,
            service: { select: { name: true, arabicName: true } },
          },
        },
        products: { select: { name: true, quantity: true, total: true } },
        review: { select: { rating: true } },
      },
    });

    // The same answer either way, so nobody learns which visit ids exist by
    // watching the error change.
    if (!visit || visit.customerId !== session.user.customerId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Only the two the customer's copy needs: the name at the top and a number
    // to ring if something is wrong with it.
    const settings = await prisma.setting.findMany({
      where: { key: { in: ["shop_name", "shop_phone"] } },
      select: { key: true, value: true },
    });
    const shop = Object.fromEntries(settings.map((s) => [s.key, s.value]));

    return NextResponse.json({
      id: visit.id,
      receiptNo: visit.sessionSequence != null ? String(visit.sessionSequence) : visit.id.slice(-8).toUpperCase(),
      visitAt: visit.visitAt,
      total: visit.total,
      barber: visit.barber,
      rating: visit.review?.rating ?? null,
      services: visit.items.map((i) => ({
        name: i.service?.name ?? null,
        arabicName: i.service?.arabicName ?? null,
        quantity: i.quantity,
        price: i.priceAtTime,
      })),
      products: visit.products.map((p) => ({ name: p.name, quantity: p.quantity, total: p.total })),
      shop: { name: shop["shop_name"] ?? "Escape Barbershop", phone: shop["shop_phone"] || null },
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[customer/visits/:id]", err);
    return NextResponse.json({ error: "Could not load that" }, { status: 400 });
  }
}
