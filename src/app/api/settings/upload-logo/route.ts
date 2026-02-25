import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    await requireOwner();
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "Only image files are allowed" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");
    const dataUrl = `data:${file.type};base64,${base64}`;

    await prisma.setting.upsert({
      where: { key: "shop_logo" },
      update: { value: dataUrl },
      create: { key: "shop_logo", value: dataUrl },
    });

    return NextResponse.json({ url: dataUrl });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error(err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
