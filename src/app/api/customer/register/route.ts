import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { customerRegisterSchema } from "@/lib/validations";
import { normalizePhone } from "@/lib/customers";
import { customerByCode } from "@/lib/referrals-server";
import { getReferralSettings } from "@/lib/loyalty-server";

/**
 * A customer signing themselves up, from the phone in their hand. The phone
 * number is their username. If the shop already has them on file — they have
 * been in before — the login is attached to that record, so their history and
 * their barber's notes carry over.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = customerRegisterSchema.parse(body);

    const phone = normalizePhone(data.phone);
    if (!phone) {
      return NextResponse.json({ error: "Please enter a valid Egyptian mobile number" }, { status: 400 });
    }

    const existingLogin = await prisma.user.findFirst({ where: { phone }, select: { id: true } });
    if (existingLogin) {
      return NextResponse.json({ error: "That number already has an account — please sign in" }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(data.password, 10);
    const name = data.name.trim();

    // Who sent them, if anybody. A code nobody recognises is ignored rather
    // than refused: the account matters more than the referral.
    const settings = await getReferralSettings();
    const referrer =
      settings.enabled && data.referralCode ? await customerByCode(data.referralCode) : null;

    await prisma.$transaction(async (tx) => {
      // Reuse the shop's record for this number where there is exactly one and
      // nobody has claimed it yet; duplicates are left alone and a new one is made.
      const matches = await tx.customer.findMany({ where: { phone }, select: { id: true, user: { select: { id: true } } } });
      const free = matches.filter((c) => !c.user);
      const customer =
        matches.length === 1 && free.length === 1
          ? free[0]
          : await tx.customer.create({ data: { name, phone } });

      await tx.user.create({
        data: { name, phone, password: passwordHash, role: "CUSTOMER", customerId: customer.id },
      });

      // Nobody refers themselves, and nobody is referred twice.
      if (referrer && referrer.id !== customer.id) {
        const already = await tx.referral.findUnique({ where: { referredId: customer.id }, select: { id: true } });
        if (!already) {
          await tx.referral.create({ data: { referrerId: referrer.id, referredId: customer.id } });
        }
      }
    });

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message.includes("Unique constraint")) {
      return NextResponse.json({ error: "That number already has an account — please sign in" }, { status: 409 });
    }
    console.error("[customer/register]", err);
    return NextResponse.json({ error: "Could not create the account" }, { status: 400 });
  }
}
