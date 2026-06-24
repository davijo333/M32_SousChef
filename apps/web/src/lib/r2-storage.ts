import fs from "fs/promises";
import path from "path";

export type CatalogKind = "ingredients" | "items";
export type BillStorageType = "supplier" | "customer";

const BILL_FOLDER: Record<BillStorageType, string> = {
  supplier: "supplier_bill",
  customer: "customer_bill",
};

function r2Root(): string {
  const configured = process.env.R2_STORAGE_ROOT;
  if (configured) return path.resolve(configured);
  return path.resolve(process.cwd(), "../../storage/r2");
}

function guessExtension(contentType: string | null, sourceUrl: string): string {
  if (contentType?.includes("png")) return "png";
  if (contentType?.includes("webp")) return "webp";
  if (contentType?.includes("gif")) return "gif";
  if (contentType?.includes("jpeg") || contentType?.includes("jpg")) return "jpg";

  const urlPath = sourceUrl.split("?")[0].toLowerCase();
  if (urlPath.endsWith(".png")) return "png";
  if (urlPath.endsWith(".webp")) return "webp";
  if (urlPath.endsWith(".gif")) return "gif";
  return "jpg";
}

function extFromFilename(filename: string): string {
  const base = filename.split("?")[0].toLowerCase();
  const ext = base.split(".").pop();
  if (ext && ["png", "jpg", "jpeg", "pdf", "webp", "gif"].includes(ext)) {
    return ext === "jpeg" ? "jpg" : ext;
  }
  return "bin";
}

function extFromMime(mimeType: string): string {
  if (mimeType.includes("pdf")) return "pdf";
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("gif")) return "gif";
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
  return "bin";
}

function safeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-|-$/g, "") || "bill";
}

function stripKnownExtension(filename: string): { base: string; ext: string | null } {
  const safe = safeFilename(filename);
  const lower = safe.toLowerCase();
  for (const ext of ["pdf", "png", "jpg", "jpeg", "webp", "gif"] as const) {
    const suffix = `.${ext}`;
    if (lower.endsWith(suffix)) {
      return { base: safe.slice(0, -suffix.length), ext: ext === "jpeg" ? "jpg" : ext };
    }
  }
  return { base: safe, ext: null };
}

export function buildBillR2Key(
  userId: string,
  billType: BillStorageType,
  billId: string,
  filename: string,
  mimeType?: string
) {
  const { base, ext: extFromName } = stripKnownExtension(filename);
  const ext =
    extFromName ??
    (mimeType ? extFromMime(mimeType) : extFromFilename(filename));
  const folder = BILL_FOLDER[billType];
  return `${userId}/${folder}/${billId}-${base}.${ext}`;
}

export type CatalogCollection = "dishes" | "ingredients" | "addons";

export type CatalogImageSlot = "default" | "secondary";

const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp"] as const;

/** @deprecated use buildSlugCatalogImageKey */
export function buildR2RelativeKey(kind: CatalogKind, slug: string, ext: string) {
  return `${kind}/${slug}/image/selected.${ext}`;
}

/** @deprecated use buildSlugCatalogImageKey */
export function buildCatalogImageKey(collection: CatalogCollection, entityId: string, ext: string) {
  return `${collection}/${entityId}/image.${ext}`;
}

/** Stable slug path: dishes/dish-sunrise-stack/default.jpg */
export function buildSlugCatalogImageKey(
  collection: CatalogCollection,
  slug: string,
  slot: CatalogImageSlot,
  ext: string
) {
  return `${collection}/${slug}/${slot}.${ext}`;
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

export async function persistCatalogImageToSlug(
  collection: CatalogCollection,
  slug: string,
  slot: CatalogImageSlot,
  sourceUrl: string
): Promise<{ r2Key: string; publicUrl: string }> {
  if (!sourceUrl?.startsWith("http")) {
    throw new Error("imageUrl must be an http(s) URL");
  }

  const res = await fetch(sourceUrl, {
    headers: { "User-Agent": "SousChef/1.0 (image persist)" },
  });
  if (!res.ok) {
    throw new Error(`Failed to download image (${res.status})`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  const ext = guessExtension(res.headers.get("content-type"), sourceUrl);
  const r2Key = buildSlugCatalogImageKey(collection, slug, slot, ext);
  const dest = resolveR2Path(r2Key);

  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, buffer);

  return {
    r2Key,
    publicUrl: buildR2PublicUrl(r2Key),
  };
}

export function buildR2PublicUrl(relativeKey: string) {
  return `/api/r2/${relativeKey}`;
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

  const res = await fetch(sourceUrl, {
    headers: { "User-Agent": "SousChef/1.0 (image persist)" },
  });
  if (!res.ok) {
    throw new Error(`Failed to download image (${res.status})`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  const ext = guessExtension(res.headers.get("content-type"), sourceUrl);
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

  const res = await fetch(sourceUrl, {
    headers: { "User-Agent": "SousChef/1.0 (image persist)" },
  });
  if (!res.ok) {
    throw new Error(`Failed to download image (${res.status})`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  const ext = guessExtension(res.headers.get("content-type"), sourceUrl);
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

export function isUserBillR2Key(relativeKey: string, userId: string): boolean {
  const prefix = `${userId}/`;
  if (!relativeKey.startsWith(prefix)) return false;
  return (
    relativeKey.includes("/supplier_bill/") || relativeKey.includes("/customer_bill/")
  );
}
