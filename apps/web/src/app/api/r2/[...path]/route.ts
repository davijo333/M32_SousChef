import fs from "fs/promises";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@backend/services/infra/auth";
import { isCatalogSlugImageKey, isUserBillR2Key, resolveR2Path } from "@backend/services/infra/r2-storage";

const MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  pdf: "application/pdf",
  bin: "application/octet-stream",
};

export async function GET(
  _req: Request,
  { params }: { params: { path: string[] } }
) {
  const relativeKey = params.path.join("/");
  const isCatalogImage =
    isCatalogSlugImageKey(relativeKey) ||
    /^dishes\/[^/]+\/image\./.test(relativeKey) ||
    /^ingredients\/[^/]+\/image\./.test(relativeKey) ||
    relativeKey.includes("/image/");
  const isBillFile =
    relativeKey.includes("/supplier_bill/") || relativeKey.includes("/customer_bill/");

  if (!isCatalogImage && !isBillFile) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (isBillFile) {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId || !isUserBillR2Key(relativeKey, userId)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const filePath = resolveR2Path(relativeKey);
    const data = await fs.readFile(filePath);
    const ext = relativeKey.split(".").pop()?.toLowerCase() ?? "bin";
    return new NextResponse(data, {
      headers: {
        "Content-Type": MIME[ext] ?? "application/octet-stream",
        "Cache-Control": isBillFile ? "private, max-age=3600" : "public, max-age=86400",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
