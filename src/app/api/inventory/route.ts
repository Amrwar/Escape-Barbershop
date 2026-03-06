import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireOwner } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    await requireAuth();
    const includeInactive = req.nextUrl.searchParams.get("all") === "true";
    const products = await prisma.product.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(products);
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized"))
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireOwner();
    const { name, unit } = await req.json();
    if (!name?.trim())
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    const product = await prisma.product.create({
      data: { name: name.trim(), unit: unit?.trim() || "pcs" },
    });
    return NextResponse.json(product, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized"))
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (err instanceof Error && err.message.includes("Unique constraint"))
      return NextResponse.json({ error: "Product name already exists" }, { status: 409 });
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
