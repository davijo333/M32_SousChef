type CatalogItem = { slug: string; name: string };

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

export function scoreMatch(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.85;
  const aWords = na.split(" ");
  const bWords = new Set(nb.split(" "));
  const overlap = aWords.filter((w) => bWords.has(w) && w.length > 2).length;
  return overlap / Math.max(aWords.length, 1);
}

export function matchLineToCatalog(
  rawName: string,
  ingredients: CatalogItem[],
  menuItems: CatalogItem[],
  suggestedCategory: "ingredient" | "menu_item"
): {
  normalizedName: string;
  matchedIngredientSlug?: string;
  matchedMenuItemSlug?: string;
} {
  const catalog = suggestedCategory === "ingredient" ? ingredients : menuItems;
  let best: CatalogItem | null = null;
  let bestScore = 0;

  for (const item of catalog) {
    const s = scoreMatch(rawName, item.name);
    if (s > bestScore) {
      bestScore = s;
      best = item;
    }
  }

  if (!best || bestScore < 0.4) {
    return { normalizedName: rawName };
  }

  if (suggestedCategory === "ingredient") {
    return { normalizedName: best.name, matchedIngredientSlug: best.slug };
  }
  return { normalizedName: best.name, matchedMenuItemSlug: best.slug };
}
