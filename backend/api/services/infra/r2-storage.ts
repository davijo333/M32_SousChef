import "server-only";

import fs from "fs/promises";
import path from "path";
import {
  buildBillR2Key,
  buildCatalogImageKey,
  buildR2PublicUrl,
  buildR2RelativeKey,
  buildSlugCatalogImageKey,
  guessImageExtension,
  isCatalogSlugImageKey,
  isImageContentType,
  isUserBillR2Key,
  type BillStorageType,
  type CatalogCollection,
  type CatalogImageSlot,
  type CatalogKind,
} from "@backend/services/infra/r2-storage-keys";

export type { BillStorageType, CatalogCollection, CatalogImageSlot, CatalogKind };
export {
  buildBillR2Key,
  buildCatalogImageKey,
  buildR2PublicUrl,
  buildR2RelativeKey,
  buildSlugCatalogImageKey,
  isCatalogSlugImageKey,
  isUserBillR2Key,
};

const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp"] as const;

function r2Root(): string {
  const configured = process.env.R2_STORAGE_ROOT;
  if (configured) return path.resolve(configured);
  return path.resolve(process.cwd(), "../../storage/r2");
}

function isValidImageBuffer(buffer: Buffer): boolean {
  if (buffer.length < 512) return false;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return true;
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return true;
  }
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    return true;
  }
  if (buffer.toString("ascii", 0, 3) === "GIF") return true;
  return false;
}

export async function findSlugCatalogImage(
  collection: CatalogCollection,
  slug: string,
  slot: CatalogImageSlot
): Promise<{ r2Key: string; publicUrl: string } | null> {
  for (const ext of IMAGE_EXTENSIONS) {
    const r2Key = buildSlugCatalogImageKey(collection, slug, slot, ext);
    try {
      await fs.access(resolveR2Path(r2Key));
      return { r2Key, publicUrl: buildR2PublicUrl(r2Key) };
    } catch {
      // try next extension
    }
  }
  return null;
}

function imageDownloadHeaders(sourceUrl: string, withReferer: boolean): HeadersInit {
  const headers: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
  };
  if (withReferer) {
    try {
      headers.Referer = new URL(sourceUrl).origin;
    } catch {
      // ignore invalid URL
    }
  }
  return headers;
}

async function downloadRemoteImage(sourceUrl: string): Promise<Response> {
  const attempts = [true, false];
  let lastStatus = 0;

  for (const withReferer of attempts) {
    const res = await fetch(sourceUrl, {
      headers: imageDownloadHeaders(sourceUrl, withReferer),
      redirect: "follow",
    });
    if (res.ok) return res;
    lastStatus = res.status;
    if (res.status !== 403 && res.status !== 404) break;
  }

  throw new Error(`Failed to download image (${lastStatus || "unknown"})`);
}

export async function persistCatalogImageToSlug(
  collection: CatalogCollection,
  slug: string,
  slot: CatalogImageSlot,
  sourceUrl: string
): Promise<{ r2Key: string; publicUrl: string }> {
  if (!sourceUrl?.startsWith("http")) {
    throw new Error("imageUrl must be an http(s) URL");
  }

  const res = await downloadRemoteImage(sourceUrl);

  const contentType = res.headers.get("content-type");
  if (!isImageContentType(contentType)) {
    throw new Error(`Remote URL is not an image (${contentType ?? "unknown type"})`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  if (!isValidImageBuffer(buffer)) {
    throw new Error("Downloaded file is not a valid image");
  }

  const ext = guessImageExtension(contentType, sourceUrl);
  const r2Key = buildSlugCatalogImageKey(collection, slug, slot, ext);
  const dest = resolveR2Path(r2Key);

  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, buffer);

  return {
    r2Key,
    publicUrl: buildR2PublicUrl(r2Key),
  };
}

/** Local filesystem path for a relative R2 key (Cloudflare R2 mirror layout). */
export function resolveR2Path(relativeKey: string) {
  const normalized = relativeKey.replace(/^\/+/, "");
  const full = path.join(r2Root(), normalized);
  const root = path.resolve(r2Root());
  if (!path.resolve(full).startsWith(root)) {
    throw new Error("Invalid storage path");
  }
  return full;
}

/**
 * Download selected image and store under:
 *   storage/r2/dishes/{mongoId}/image.{ext}
 *   storage/r2/ingredients/{mongoId}/image.{ext}
 */
export async function persistCatalogImage(
  collection: CatalogCollection,
  entityId: string,
  sourceUrl: string
): Promise<{ r2Key: string; publicUrl: string }> {
  if (!sourceUrl?.startsWith("http")) {
    throw new Error("imageUrl must be an http(s) URL");
  }

  const res = await downloadRemoteImage(sourceUrl);

  const buffer = Buffer.from(await res.arrayBuffer());
  const ext = guessImageExtension(res.headers.get("content-type"), sourceUrl);
  const r2Key = buildCatalogImageKey(collection, entityId, ext);
  const dest = resolveR2Path(r2Key);

  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, buffer);

  return {
    r2Key,
    publicUrl: buildR2PublicUrl(r2Key),
  };
}

/**
 * @deprecated Prefer persistCatalogImage with entity MongoDB id.
 */
export async function persistSelectedImage(
  kind: CatalogKind,
  slug: string,
  sourceUrl: string
): Promise<{ r2Key: string; publicUrl: string }> {
  if (!sourceUrl?.startsWith("http")) {
    throw new Error("imageUrl must be an http(s) URL");
  }

  const res = await downloadRemoteImage(sourceUrl);

  const buffer = Buffer.from(await res.arrayBuffer());
  const ext = guessImageExtension(res.headers.get("content-type"), sourceUrl);
  const r2Key = buildR2RelativeKey(kind, slug, ext);
  const dest = resolveR2Path(r2Key);

  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, buffer);

  return {
    r2Key,
    publicUrl: buildR2PublicUrl(r2Key),
  };
}

/** Store uploaded bill file: {userId}/supplier_bill|customer_bill/{billId}-{filename}.ext */
export async function persistBillFile(
  userId: string,
  billType: BillStorageType,
  billId: string,
  buffer: Buffer,
  filename: string,
  mimeType?: string
): Promise<{ r2Key: string; publicUrl: string }> {
  const r2Key = buildBillR2Key(userId, billType, billId, filename, mimeType);
  const dest = resolveR2Path(r2Key);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, buffer);
  return {
    r2Key,
    publicUrl: buildR2PublicUrl(r2Key),
  };
}

export async function deleteR2Object(relativeKey: string): Promise<void> {
  const dest = resolveR2Path(relativeKey);
  await fs.unlink(dest).catch(() => undefined);
}

const BILL_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  pdf: "application/pdf",
  bin: "application/octet-stream",
};

/** Read a stored bill file; tries legacy double-extension keys (e.g. .pdf.pdf). */
export async function readBillFileBuffer(
  relativeKey: string
): Promise<{ data: Buffer; contentType: string }> {
  const candidates = [relativeKey];
  if (relativeKey.endsWith(".pdf")) {
    candidates.push(`${relativeKey}.pdf`);
  }

  let lastError: unknown;
  for (const key of candidates) {
    try {
      const data = await fs.readFile(resolveR2Path(key));
      const ext = key.split(".").pop()?.toLowerCase() ?? "bin";
      return { data, contentType: BILL_MIME[ext] ?? "application/octet-stream" };
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError ?? new Error("Bill file not found");
}
