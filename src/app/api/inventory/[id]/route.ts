import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireOwner();
    const { name, unit, isActive } = await req.json();
    const product = await prisma.product.update({
      where: { id: params.id },
      data: {
        ...(name !== undefined && { name: String(name).trim() }),
        ...(unit !== undefined && { unit: String(unit).trim() }),
        ...(isActive !== undefined && { isActive: Boolean(isActive) }),
      },
    });
    return NextResponse.json(product);
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized"))
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (err instanceof Error && err.message.includes("Unique constraint"))
      return NextResponse.json({ error: "Product name already exists" }, { status: 409 });
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireOwner();
    const count = await prisma.productUsage.count({ where: { productId: params.id } });
    if (count > 0) {
      const product = await prisma.product.update({
        where: { id: params.id },
        data: { isActive: false },
      });
      return NextResponse.json({ deactivated: true, product });
    }
    await prisma.product.delete({ where: { id: params.id } });
    return NextResponse.json({ deleted: true });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized"))
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
