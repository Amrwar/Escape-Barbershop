import { prisma } from "./prisma";
import { makeCode, normaliseCode, referralStanding, type ReferralStanding } from "./referrals";

/**
 * The database side of "tell a friend": handing out a code, reading it back,
 * and working out what a customer is owed.
 */

/**
 * The customer's code, made the first time anybody asks for it.
 *
 * Codes are short enough to collide once in a long while, so a clash simply
 * tries again rather than failing in a customer's face.
 */
export async function codeFor(customerId: string): Promise<string | null> {
  const existing = await prisma.customer.findUnique({ where: { id: customerId }, select: { referralCode: true } });
  if (!existing) return null;
  if (existing.referralCode) return existing.referralCode;

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = makeCode();
    try {
      const updated = await prisma.customer.update({
        where: { id: customerId },
        data: { referralCode: code },
        select: { referralCode: true },
      });
      return updated.referralCode;
    } catch {
      // Taken by somebody else between the check and the write: try another.
    }
  }

  console.error("[referrals] could not find a free code for", customerId);
  return null;
}

/** Who owns this code, if anybody. */
export async function customerByCode(raw: string): Promise<{ id: string; name: string } | null> {
  const code = normaliseCode(raw);
  if (code.length < 4) return null;
  return prisma.customer.findFirst({ where: { referralCode: code }, select: { id: true, name: true } });
}

/** What this customer has earned by bringing people in. */
export async function standingFor(customerId: string): Promise<ReferralStanding> {
  const referrals = await prisma.referral.findMany({
    where: { referrerId: customerId },
    select: { referredId: true, rewardGivenAt: true },
  });
  if (referrals.length === 0) return referralStanding([], {});

  const visits = await prisma.visit.groupBy({
    by: ["customerId"],
    where: { customerId: { in: referrals.map((r) => r.referredId) } },
    _count: { _all: true },
  });

  const paidVisits: Record<string, number> = {};
  for (const row of visits) paidVisits[row.customerId] = row._count._all;

  return referralStanding(referrals, paidVisits);
}
