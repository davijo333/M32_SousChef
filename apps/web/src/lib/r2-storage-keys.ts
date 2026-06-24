/** Client-safe R2 path helpers — no Node fs/path imports. */

export type CatalogKind = "ingredients" | "items";
export type BillStorageType = "supplier" | "customer";

const BILL_FOLDER: Record<BillStorageType, string> = {
  supplier: "supplier_bill",
  customer: "customer_bill",
};

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

const CATALOG_SLUG_IMAGE_RE =
  /^(dishes|ingredients|addons)\/[^/]+\/(default|secondary)\.(jpe?g|png|webp|gif)$/i;

export function isCatalogSlugImageKey(relativeKey: string): boolean {
  return CATALOG_SLUG_IMAGE_RE.test(relativeKey.replace(/^\/+/, ""));
}

export function isImageContentType(contentType: string | null): boolean {
  if (!contentType) return false;
  const lower = contentType.toLowerCase();
  return lower.startsWith("image/") && !lower.includes("svg");
}

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

export function buildR2PublicUrl(relativeKey: string) {
  return `/api/r2/${relativeKey}`;
}

export function isUserBillR2Key(relativeKey: string, userId: string): boolean {
  const prefix = `${userId}/`;
  if (!relativeKey.startsWith(prefix)) return false;
  return (
    relativeKey.includes("/supplier_bill/") || relativeKey.includes("/customer_bill/")
  );
}

export function guessImageExtension(contentType: string | null, sourceUrl: string): string {
  return guessExtension(contentType, sourceUrl);
}
