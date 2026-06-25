import { AddOn } from "@backend/models/AddOn";
import { Ingredient } from "@backend/models/Ingredient";
import { addOnSlugFromName } from "@backend/services/catalog/dish-catalog";
import { ingredientSlugFromName } from "@backend/services/catalog/ingredient-provision";
import { connectDB } from "@backend/services/infra/mongodb";

export type IngredientLookupRow = {
  name: string;
  slug: string;
  currentQty: number;
  reorderThreshold: number;
  inventoryUnit: string;
  category: string;
};

export type MenuItemLookupRow = {
  name: string;
  slug: string;
  sellPrice: number;
};

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function significantTokens(value: string): string[] {
  const stop = new Set(["the", "a", "an", "of", "for", "on", "and", "with"]);
  return normalizeName(value)
    .split(/\s+/)
    .filter((word) => word.length > 2 && !stop.has(word));
}

function scoreIngredientName(query: string, name: string, slug: string): number {
  const q = normalizeName(query);
  const n = normalizeName(name);
  const s = slug.toLowerCase();
  if (!q) return 0;
  if (q === n || s === ingredientSlugFromName(query)) return 1;
  if (n.includes(q) || q.includes(n)) return 0.95;
  if (s.includes(q.replace(/\s+/g, "-")) || q.replace(/\s+/g, "-").includes(s)) return 0.9;

  const qTokens = significantTokens(query);
  const nTokens = new Set(significantTokens(name));
  if (!qTokens.length || !nTokens.size) return 0;
  let overlap = 0;
  for (const token of qTokens) {
    if (nTokens.has(token)) overlap += 1;
  }
  const tokenScore = overlap / qTokens.length;
  if (tokenScore >= 0.75 && overlap >= 2) return tokenScore;

  const qWords = new Set(q.split(/\s+/).filter(Boolean));
  const nWords = new Set(n.split(/\s+/).filter(Boolean));
  if (!qWords.size || !nWords.size) return 0;
  overlap = 0;
  for (const word of qWords) {
    if (nWords.has(word)) overlap += 1;
  }
  return overlap / Math.max(qWords.size, nWords.size);
}

function resolveByName<T extends { name: string; slug: string }>(
  rows: T[],
  query: string,
  slugFromName: (q: string) => string
): T | null {
  const key = query.trim();
  if (!key || !rows.length) return null;

  const exact = rows.find((row) => row.name.toLowerCase() === key.toLowerCase());
  if (exact) return exact;

  const bySlug = rows.find((row) => row.slug === slugFromName(key));
  if (bySlug) return bySlug;

  if (key.startsWith("ing-")) {
    const byIngSlug = rows.find((row) => row.slug === key.toLowerCase());
    if (byIngSlug) return byIngSlug;
  }

  const keyLower = key.toLowerCase();
  const substringMatches = rows.filter(
    (row) =>
      row.name.toLowerCase().includes(keyLower) || keyLower.includes(row.name.toLowerCase())
  );
  if (substringMatches.length === 1) return substringMatches[0];

  const qTokens = significantTokens(key);
  if (qTokens.length >= 2) {
    const tokenMatches = rows.filter((row) => {
      const n = normalizeName(row.name);
      return qTokens.every((token) => n.includes(token));
    });
    if (tokenMatches.length === 1) return tokenMatches[0];
  }

  const scored = rows
    .map((row) => ({
      row,
      score: scoreIngredientName(key, row.name, row.slug),
    }))
    .filter((entry) => entry.score >= 0.55)
    .sort((a, b) => b.score - a.score);

  if (!scored.length) return null;
  if (scored.length === 1 || scored[0].score >= 0.85) return scored[0].row;
  if (scored[0].score >= 0.75 && scored[0].score - (scored[1]?.score ?? 0) >= 0.15) {
    return scored[0].row;
  }
  return null;
}

export async function searchIngredientsByNameQuery(
  restaurantId: string,
  query: string,
  limit = 5
): Promise<Array<IngredientLookupRow & { score: number }>> {
  await connectDB();
  const rows = await Ingredient.find({ restaurantId })
    .select("name slug currentQty reorderThreshold inventoryUnit category")
    .lean();

  const key = query.trim();
  if (!key || !rows.length) return [];

  return rows
    .map((row) => ({
      name: row.name,
      slug: row.slug,
      currentQty: Number(row.currentQty ?? 0),
      reorderThreshold: Number(row.reorderThreshold ?? 0),
      inventoryUnit: row.inventoryUnit ?? "each",
      category: row.category ?? "misc",
      score: scoreIngredientName(key, row.name, row.slug),
    }))
    .filter((entry) => entry.score >= 0.45)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export async function findIngredientByNameQuery(
  restaurantId: string,
  query: string
): Promise<IngredientLookupRow | null> {
  await connectDB();
  const rows = await Ingredient.find({ restaurantId })
    .select("name slug currentQty reorderThreshold inventoryUnit category")
    .lean();
  const match = resolveByName(rows, query, ingredientSlugFromName);
  if (!match) return null;
  return {
    name: match.name,
    slug: match.slug,
    currentQty: Number(match.currentQty ?? 0),
    reorderThreshold: Number(match.reorderThreshold ?? 0),
    inventoryUnit: match.inventoryUnit ?? "each",
    category: match.category ?? "misc",
  };
}

export async function findAddOnByNameQuery(
  restaurantId: string,
  query: string
): Promise<MenuItemLookupRow | null> {
  await connectDB();
  const rows = await AddOn.find({ restaurantId }).select("name slug sellPrice").lean();
  const match = resolveByName(rows, query, addOnSlugFromName);
  if (!match) return null;
  return {
    name: match.name,
    slug: match.slug,
    sellPrice: Number(match.sellPrice ?? 0),
  };
}
