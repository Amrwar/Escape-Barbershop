import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCustomer } from "@/lib/auth";
import { getInstapayAddress } from "@/lib/deposits-server";

/**
 * Where to send a deposit.
 *
 * This exists because the notice telling a customer to transfer money was
 * reading the shop's settings endpoint, which is staff-only: every customer got
 * a 401, the address came back null, and the block holding it never rendered.
 * They were told "send 200 to hold this chair", given a reference, and no
 * destination at all.
 *
 * Deliberately its own route rather than a field on the catalog. The shop's
 * InstaPay address is where its money arrives, so it goes to the one customer
 * who has been asked for a deposit and is owed an answer — not to the public
 * price list, and not to everybody who happens to be signed in.
 */
export async function GET() {
  try {
    const session = await requireCustomer();

    const owed = await prisma.appointment.findFirst({
      where: { customerId: session.user.customerId, depositStatus: "EXPECTED" },
      select: { id: true },
    });
    if (!owed) return NextResponse.json({ instapay: null });

    return NextResponse.json({ instapay: await getInstapayAddress() });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
