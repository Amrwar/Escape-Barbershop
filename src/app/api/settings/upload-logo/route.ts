import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";

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
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
    const filename = `logo.${ext}`;
    const uploadDir = path.join(process.cwd(), "public", "uploads");
    await mkdir(uploadDir, { recursive: true });
    const bytes = await file.arrayBuffer();
    await writeFile(path.join(uploadDir, filename), Buffer.from(bytes));
    const url = `/uploads/${filename}`;
    await prisma.setting.upsert({
      where: { key: "shop_logo" },
      update: { value: url },
      create: { key: "shop_logo", value: url },
    });
    return NextResponse.json({ url });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error(err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
