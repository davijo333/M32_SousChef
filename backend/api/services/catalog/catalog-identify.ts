const AGENT_URL = process.env.AGENT_SERVICE_URL ?? "http://localhost:8000";

export type CatalogIdentification = {
  itemType: "ingredient" | "dish";
  name: string;
  brandName?: string;
  category?: string;
  classification?: string;
  description?: string;
  confidence: number;
  imageUrl?: string;
  source?: string;
};

export async function identifyCatalogFile(
  file: File,
  itemTypeHint?: string
): Promise<CatalogIdentification> {
  const form = new FormData();
  form.append("file", file);
  if (itemTypeHint) form.append("item_type_hint", itemTypeHint);

  const res = await fetch(`${AGENT_URL}/identify-catalog-item`, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    throw new Error(await res.text());
  }
  const data = (await res.json()) as CatalogIdentification & { itemType?: string };
  return {
    ...data,
    itemType: data.itemType === "dish" ? "dish" : "ingredient",
    confidence: Number(data.confidence ?? 0.7),
  };
}

export async function identifyCatalogImageUrl(
  imageUrl: string,
  itemTypeHint?: string
): Promise<CatalogIdentification> {
  const form = new FormData();
  form.append("image_url", imageUrl);
  if (itemTypeHint) form.append("item_type_hint", itemTypeHint);

  const res = await fetch(`${AGENT_URL}/identify-catalog-item`, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    throw new Error(await res.text());
  }
  const data = (await res.json()) as CatalogIdentification & { itemType?: string };
  return {
    ...data,
    itemType: data.itemType === "dish" ? "dish" : "ingredient",
    confidence: Number(data.confidence ?? 0.7),
    imageUrl: data.imageUrl || imageUrl,
    source: data.source || "link",
  };
}
