import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";
import { userCreateSchema } from "@/lib/validations";
import { normalizePhone } from "@/lib/customers";
import { recordAudit } from "@/lib/audit";

// Staff logins. Owner-only, and password hashes never leave the server.
export async function GET() {
  try {
    await requireOwner();
    const users = await prisma.user.findMany({
      orderBy: [{ role: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        createdAt: true,
        barber: { select: { id: true, name: true } },
      },
    });
    return NextResponse.json(users);
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authSession = await requireOwner();
    const data = userCreateSchema.parse(await req.json());

    // A phone login is stored the way a customer's is, so the same normaliser
    // decides what counts as a number and the same lookup finds it at sign-in.
    const phone = data.phone ? normalizePhone(data.phone) : null;
    if (data.phone && !phone) {
      return NextResponse.json({ error: "invalid_phone" }, { status: 400 });
    }

    const user = await prisma.user.create({
      data: {
        name: data.name.trim(),
        email: data.email?.trim() ?? null,
        phone,
        password: await bcrypt.hash(data.password, 12),
        role: data.role,
        ...(data.role === "BARBER" ? { barberId: data.barberId } : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        createdAt: true,
        barber: { select: { id: true, name: true } },
      },
    });
    await recordAudit(authSession, {
      action: "CREATE",
      entity: "USER",
      entityId: user.id,
      summary: `Added the ${user.role} login ${user.email ?? user.phone}`,
    });

    return NextResponse.json(user, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err instanceof Error && err.message.includes("Unique constraint")) {
      // Either way in can already be taken, and the form needs to know which.
      const onPhone = err.message.includes("phone");
      return NextResponse.json({ error: onPhone ? "phone_exists" : "email_exists" }, { status: 409 });
    }
    console.error("[users]", err);
    return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  }
}
