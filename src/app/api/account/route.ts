import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { passwordChangeSchema, profileSchema } from "@/lib/validations";
import { recordAudit } from "@/lib/audit";

// Your own login. Anyone signed in can change their own name, email and
// password — changing the password always requires the current one, so a
// forgotten unlocked screen cannot be used to lock the real owner out.
export async function GET() {
  try {
    const session = await requireAuth();
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, name: true, email: true, role: true },
    });
    if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(user);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireAuth();
    const body = await req.json();

    const user = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Password change: verify the current one first.
    if (body.newPassword !== undefined) {
      const data = passwordChangeSchema.parse({
        currentPassword: body.currentPassword,
        newPassword: body.newPassword,
      });
      const valid = await bcrypt.compare(data.currentPassword, user.password);
      if (!valid) return NextResponse.json({ error: "current_password_wrong" }, { status: 403 });

      await prisma.user.update({
        where: { id: user.id },
        data: { password: await bcrypt.hash(data.newPassword, 12) },
      });
      await recordAudit(session, {
        action: "UPDATE",
        entity: "USER",
        entityId: user.id,
        summary: `Changed their own password (${user.email})`,
      });

      return NextResponse.json({ passwordChanged: true });
    }

    // Name / email change.
    const profile = profileSchema.parse(body);
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        ...(profile.name !== undefined && { name: profile.name.trim() }),
        ...(profile.email !== undefined && { email: profile.email.trim() }),
      },
      select: { id: true, name: true, email: true, role: true },
    });
    await recordAudit(session, {
      action: "UPDATE",
      entity: "USER",
      entityId: updated.id,
      summary: `Updated their own login details (${updated.email})`,
    });

    return NextResponse.json(updated);
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err instanceof Error && err.message.includes("Unique constraint")) {
      return NextResponse.json({ error: "email_exists" }, { status: 409 });
    }
    return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  }
}
