import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";
import { userUpdateSchema } from "@/lib/validations";
import { recordAudit } from "@/lib/audit";

/**
 * Two rules keep the shop from locking itself out:
 *  - the last remaining owner cannot be demoted or deleted;
 *  - you cannot delete the account you are signed in with.
 */
async function ownerCount() {
  return prisma.user.count({ where: { role: "OWNER" } });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireOwner();
    const data = userUpdateSchema.parse(await req.json());

    const target = await prisma.user.findUnique({ where: { id: params.id } });
    if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (data.role && data.role !== "OWNER" && target.role === "OWNER" && (await ownerCount()) <= 1) {
      return NextResponse.json({ error: "last_owner" }, { status: 409 });
    }

    const updated = await prisma.user.update({
      where: { id: params.id },
      data: {
        ...(data.name !== undefined && { name: data.name.trim() }),
        ...(data.email !== undefined && { email: data.email.trim() }),
        ...(data.role !== undefined && { role: data.role }),
        // An owner resetting someone else does not need their old password;
        // resetting your own goes through /api/account, which does.
        ...(data.password !== undefined && { password: await bcrypt.hash(data.password, 12) }),
      },
      select: { id: true, name: true, email: true, role: true },
    });

    await recordAudit(session, {
      action: "UPDATE",
      entity: "USER",
      entityId: updated.id,
      summary: [
        data.password !== undefined ? "Reset the password of" : "Updated",
        updated.email,
        data.role !== undefined && data.role !== target.role ? `to ${data.role}` : null,
      ]
        .filter(Boolean)
        .join(" "),
    });

    return NextResponse.json({ ...updated, isSelf: updated.id === session.user.id });
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

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireOwner();

    if (params.id === session.user.id) {
      return NextResponse.json({ error: "cannot_delete_self" }, { status: 409 });
    }

    const target = await prisma.user.findUnique({ where: { id: params.id } });
    if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (target.role === "OWNER" && (await ownerCount()) <= 1) {
      return NextResponse.json({ error: "last_owner" }, { status: 409 });
    }

    // Drawer sessions and cash movements reference the user who made them, so a
    // user who has worked a till is kept for the audit trail and blocked instead.
    const [opened, closed, movements] = await Promise.all([
      prisma.cashDrawerSession.count({ where: { openedByUserId: params.id } }),
      prisma.cashDrawerSession.count({ where: { closedByUserId: params.id } }),
      prisma.cashMovement.count({ where: { createdByUserId: params.id } }),
    ]);
    if (opened + closed + movements > 0) {
      return NextResponse.json({ error: "has_history" }, { status: 409 });
    }

    await prisma.user.delete({ where: { id: params.id } });

    await recordAudit(session, {
      action: "DELETE",
      entity: "USER",
      entityId: params.id,
      summary: `Removed the ${target.role} login ${target.email}`,
    });

    return NextResponse.json({ deleted: true });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
