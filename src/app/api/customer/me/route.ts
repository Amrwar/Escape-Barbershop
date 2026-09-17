import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireCustomer } from "@/lib/auth";
import { customerProfileSchema } from "@/lib/validations";
import { UPCOMING_STATUSES } from "@/lib/customer-api";
import { normalizePhone } from "@/lib/customers";
import { getLoyaltySettings, standingFor } from "@/lib/loyalty-server";

/** The customer's own profile, with a little of their history. */
export async function GET() {
  try {
    const session = await requireCustomer();
    const [customer, visits, upcoming] = await Promise.all([
      prisma.customer.findUnique({
        where: { id: session.user.customerId },
        select: { id: true, name: true, phone: true, photo: true, birthday: true },
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

/**
 * Their own details: name, number, birthday, picture, password.
 *
 * The phone number is also the username, so changing it moves the login with
 * it — and it must stay theirs alone, or two people would be signing in as the
 * same person.
 */
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

    let phone: string | undefined;
    if (data.phone !== undefined) {
      const normalised = normalizePhone(data.phone);
      if (!normalised) {
        return NextResponse.json({ error: "Please enter a valid Egyptian mobile number" }, { status: 400 });
      }
      const taken = await prisma.user.findFirst({
        where: { phone: normalised, NOT: { id: session.user.id } },
        select: { id: true },
      });
      if (taken) {
        return NextResponse.json({ error: "That number already has an account" }, { status: 409 });
      }
      phone = normalised;
    }

    if (data.birthday) {
      // Midday, so no timezone can nudge it onto the day before.
      const parsed = new Date(`${data.birthday}T12:00:00Z`);
      if (Number.isNaN(parsed.getTime()) || parsed.getTime() > Date.now()) {
        return NextResponse.json({ error: "That birthday does not look right" }, { status: 400 });
      }
    }

    if (data.photo) {
      if (!data.photo.startsWith("data:image/")) {
        return NextResponse.json({ error: "That does not look like a picture" }, { status: 400 });
      }
    }

    const name = data.name?.trim();
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: session.user.id },
        data: {
          ...(name ? { name } : {}),
          ...(phone ? { phone } : {}),
          ...(data.newPassword ? { password: await bcrypt.hash(data.newPassword, 10) } : {}),
        },
      });

      await tx.customer.update({
        where: { id: session.user.customerId },
        data: {
          ...(name ? { name } : {}),
          ...(phone ? { phone } : {}),
          ...(data.birthday === undefined
            ? {}
            : { birthday: data.birthday ? new Date(`${data.birthday}T12:00:00Z`) : null }),
          ...(data.photo === undefined ? {} : { photo: data.photo || null }),
        },
      });
    });

    return NextResponse.json({ ok: true, phone });
  } catch (err) {
    if (err instanceof Error && err.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[customer/me]", err);
    return NextResponse.json({ error: "Could not save that" }, { status: 400 });
  }
}
