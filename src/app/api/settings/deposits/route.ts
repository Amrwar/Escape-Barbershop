import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireOwner } from "@/lib/auth";
import {
  getDepositPolicy,
  getInstapayAddress,
  getNoShowPolicy,
  saveDepositPolicy,
  saveNoShowPolicy,
  INSTAPAY_KEY,
} from "@/lib/deposits-server";
import { recordAudit } from "@/lib/audit";

/**
 * The shop's deposit policy: whether to ask at all, on what, how much, and
 * where the money goes.
 *
 * Read by anyone on the staff — the till shows what is owed — and set by the
 * owner, because taking money up front is the shop's decision rather than the
 * counter's.
 */
export async function GET() {
  try {
    await requireAuth();
    const [policy, instapay, noShow] = await Promise.all([
      getDepositPolicy(),
      getInstapayAddress(),
      getNoShowPolicy(),
    ]);
    return NextResponse.json({ ...policy, instapay, noShow });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const authSession = await requireOwner();
    const body = await req.json();

    const threshold = body.threshold === undefined ? undefined : parseFloat(String(body.threshold));
    if (threshold !== undefined && (!Number.isFinite(threshold) || threshold <= 0)) {
      return NextResponse.json({ error: "The price to ask from must be more than nothing" }, { status: 400 });
    }

    const percent = body.percent === undefined ? undefined : parseFloat(String(body.percent));
    if (percent !== undefined && (!Number.isFinite(percent) || percent < 1 || percent > 100)) {
      return NextResponse.json({ error: "Choose between 1 and 100 per cent" }, { status: 400 });
    }

    const holdHours = body.holdHours === undefined ? undefined : parseFloat(String(body.holdHours));
    if (holdHours !== undefined && (!Number.isFinite(holdHours) || holdHours < 1 || holdHours > 168)) {
      return NextResponse.json({ error: "Hold the chair between 1 hour and a week" }, { status: 400 });
    }

    const instapay = body.instapay === undefined ? undefined : String(body.instapay).trim().slice(0, 120);

    // Asking for money with nowhere to send it is worse than not asking.
    if (body.enabled === true) {
      const address = instapay ?? (await getInstapayAddress());
      if (!address) {
        return NextResponse.json(
          { error: "Add the InstaPay number or name the money should go to first" },
          { status: 400 }
        );
      }
    }

    if (body.noShow) {
      const allowed = body.noShow.allowed === undefined ? undefined : parseInt(String(body.noShow.allowed), 10);
      if (allowed !== undefined && (!Number.isFinite(allowed) || allowed < 1 || allowed > 10)) {
        return NextResponse.json({ error: "Allow between 1 and 10 missed appointments" }, { status: 400 });
      }
      const windowDays = body.noShow.windowDays === undefined ? undefined : parseInt(String(body.noShow.windowDays), 10);
      if (windowDays !== undefined && (!Number.isFinite(windowDays) || windowDays < 7 || windowDays > 730)) {
        return NextResponse.json({ error: "Look back between a week and two years" }, { status: 400 });
      }

      // Asking a customer for money needs somewhere to send it, same as above.
      if (body.noShow.enabled === true && !(instapay ?? (await getInstapayAddress()))) {
        return NextResponse.json({ error: "Add the InstaPay number the money should go to first" }, { status: 400 });
      }

      await saveNoShowPolicy({
        ...(body.noShow.enabled === undefined ? {} : { enabled: Boolean(body.noShow.enabled) }),
        ...(allowed === undefined ? {} : { allowed }),
        ...(windowDays === undefined ? {} : { windowDays }),
      });
    }

    await saveDepositPolicy({
      ...(body.enabled === undefined ? {} : { enabled: Boolean(body.enabled) }),
      ...(threshold === undefined ? {} : { threshold }),
      ...(percent === undefined ? {} : { percent }),
      ...(holdHours === undefined ? {} : { holdHours }),
    });

    if (instapay !== undefined) {
      await prisma.setting.upsert({
        where: { key: INSTAPAY_KEY },
        update: { value: instapay },
        create: { key: INSTAPAY_KEY, value: instapay },
      });
    }

    const [policy, address, noShow] = await Promise.all([
      getDepositPolicy(),
      getInstapayAddress(),
      getNoShowPolicy(),
    ]);
    await recordAudit(authSession, {
      action: "UPDATE",
      entity: "SETTING",
      entityId: "deposits",
      summary: policy.enabled
        ? `Deposits on: ${policy.percent}% of work from ${policy.threshold}, held ${policy.holdHours}h`
        : "Deposits off",
    });

    return NextResponse.json({ ...policy, instapay: address, noShow });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[settings/deposits]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
