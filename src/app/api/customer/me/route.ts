import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireCustomer } from "@/lib/auth";
import { customerProfileSchema } from "@/lib/validations";
import { UPCOMING_STATUSES } from "@/lib/customer-api";
import { getLoyaltySettings, standingFor } from "@/lib/loyalty-server";

/** The customer's own profile, with a little of their history. */
export async function GET() {
  try {
    const session = await requireCustomer();
    const [customer, visits, upcoming] = await Promise.all([
      prisma.customer.findUnique({
        where: { id: session.user.customerId },
        select: { id: true, name: true, phone: true },
      }),
      prisma.visit.count({ where: { customerId: session.user.customerId } }),
      prisma.appointment.count({
        where: {
          customerId: session.user.customerId,
          startAt: { gte: new Date() },
          status: { in: [...UPCOMING_STATUSES] },
        },
      }),
    ]);
    if (!customer) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // The punch card, only while the shop is running one.
    const loyaltySettings = await getLoyaltySettings();
    const loyalty = loyaltySettings.enabled
      ? {
          ...(await standingFor(customer.id, loyaltySettings)),
          visitsRequired: loyaltySettings.visitsRequired,
          rewardText: loyaltySettings.rewardText,
          rewardTextAr: loyaltySettings.rewardTextAr,
        }
      : null;

    return NextResponse.json({ ...customer, visitCount: visits, upcomingCount: upcoming, loyalty });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

/** Change their name, or their password. The phone number stays put. */
export async function PATCH(req: NextRequest) {
  try {
    const session = await requireCustomer();
    const body = await req.json();
    const data = customerProfileSchema.parse(body);

    if (data.newPassword) {
      const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { password: true } });
      const valid = user && data.currentPassword && (await bcrypt.compare(data.currentPassword, user.password));
      if (!valid) {
        return NextResponse.json({ error: "Your current password is not right" }, { status: 400 });
      }
    }

    const name = data.name?.trim();
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: session.user.id },
        data: {
          ...(name ? { name } : {}),
          ...(data.newPassword ? { password: await bcrypt.hash(data.newPassword, 10) } : {}),
        },
      });
      if (name) {
        await tx.customer.update({ where: { id: session.user.customerId }, data: { name } });
      }
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Error && err.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[customer/me]", err);
    return NextResponse.json({ error: "Could not save that" }, { status: 400 });
  }
}
