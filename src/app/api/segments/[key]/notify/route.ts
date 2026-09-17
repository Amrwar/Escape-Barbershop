import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";
import { SEGMENT_KEYS, membersOf, summarise, type SegmentKey } from "@/lib/segments";
import { sendPushToCustomers } from "@/lib/push";
import { recordAudit } from "@/lib/audit";

/**
 * Send one group a notification.
 *
 * Three deliberate limits, because the quickest way to lose a customer's
 * notifications for ever is to send them something they did not want:
 *
 *  - The owner alone may send, never the cashier.
 *  - The same group cannot be messaged twice within half a day.
 *  - Only customers who turned notifications on are written to, and the reply
 *    says exactly how many that was — the shop should know when a "campaign"
 *    reached four people.
 *
 * Every send is written to the activity log, with the words that were sent.
 */

const QUIET_HOURS = 12;

export async function POST(req: NextRequest, { params }: { params: { key: string } }) {
  try {
    const authSession = await requireOwner();

    if (!SEGMENT_KEYS.includes(params.key as SegmentKey)) {
      return NextResponse.json({ error: "No such group" }, { status: 404 });
    }
    const key = params.key as SegmentKey;

    const body = await req.json().catch(() => ({}));
    const title = String(body?.title ?? "").trim().slice(0, 60);
    const message = String(body?.body ?? "").trim().slice(0, 160);
    if (!title || !message) {
      return NextResponse.json({ error: "Write a title and a line of message" }, { status: 400 });
    }

    const recently = await prisma.auditLog.findFirst({
      where: {
        entity: "CUSTOMER",
        entityId: `segment:${key}`,
        at: { gte: new Date(Date.now() - QUIET_HOURS * 3_600_000) },
      },
    });
    if (recently) {
      return NextResponse.json(
        { error: `This group was already messaged today — leave it ${QUIET_HOURS} hours` },
        { status: 429 }
      );
    }

    const visits = await prisma.visit.findMany({ select: { customerId: true, visitAt: true, total: true } });
    const members = membersOf(summarise(visits), key);
    const ids = members.map((m) => m.customerId);

    const subscribed = await prisma.pushSubscription.findMany({
      where: { customerId: { in: ids } },
      select: { customerId: true },
      distinct: ["customerId"],
    });
    const recipients = subscribed.map((s) => s.customerId!).filter(Boolean);

    // The log entry goes in first, so a send that half-finishes is still
    // recorded — and so the quiet period holds even if delivery is slow.
    await recordAudit(authSession, {
      action: "CREATE",
      entity: "CUSTOMER",
      entityId: `segment:${key}`,
      summary: `Messaged the "${key}" group (${recipients.length} phones): ${title}`,
      details: { title, body: message },
    });

    const delivered = await sendPushToCustomers(recipients, {
      title,
      body: message,
      url: typeof body?.url === "string" && body.url.startsWith("/") ? body.url : "/app",
      tag: `shop-${key}`,
    });

    return NextResponse.json({ group: key, inGroup: members.length, recipients: recipients.length, delivered });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[segments/notify]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
