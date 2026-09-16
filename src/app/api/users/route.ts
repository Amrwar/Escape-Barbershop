import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";
import { userCreateSchema } from "@/lib/validations";
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

    const user = await prisma.user.create({
      data: {
        name: data.name.trim(),
        email: data.email.trim(),
        password: await bcrypt.hash(data.password, 12),
        role: data.role,
        ...(data.role === "BARBER" ? { barberId: data.barberId } : {}),
      },
      select: { id: true, name: true, email: true, role: true, createdAt: true, barber: { select: { id: true, name: true } } },
    });
    await recordAudit(authSession, {
      action: "CREATE",
      entity: "USER",
      entityId: user.id,
      summary: `Added the ${user.role} login ${user.email}`,
    });

    return NextResponse.json(user, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err instanceof Error && err.message.includes("Unique constraint")) {
      return NextResponse.json({ error: "email_exists" }, { status: 409 });
    }
    console.error("[users]", err);
    return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  }
}
