import { Dish } from "@backend/models/Dish";
import { dishSlugFromName } from "@backend/services/catalog/dish-catalog";
import { connectDB } from "@backend/services/infra/mongodb";

export type DishLookupRow = {
  name: string;
  slug: string;
  sellPrice: number;
};

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function scoreDishName(query: string, name: string, slug: string): number {
  const q = normalizeName(query);
  const n = normalizeName(name);
  const s = slug.toLowerCase();
  if (!q) return 0;
  if (q === n || s === dishSlugFromName(query)) return 1;
  if (n.includes(q) || q.includes(n)) return 0.95;
  if (s.includes(q.replace(/\s+/g, "-")) || q.replace(/\s+/g, "-").includes(s)) return 0.9;

  const qWords = new Set(q.split(/\s+/).filter(Boolean));
  const nWords = new Set(n.split(/\s+/).filter(Boolean));
  if (!qWords.size || !nWords.size) return 0;
  let overlap = 0;
  for (const word of qWords) {
    if (nWords.has(word)) overlap += 1;
  }
  return overlap / Math.max(qWords.size, nWords.size);
}

/** Resolve a chef-facing dish name to a catalog row (substring + fuzzy match). */
export async function findDishByNameQuery(
  restaurantId: string,
  query: string
): Promise<DishLookupRow | null> {
  const key = query.trim();
  if (!key) return null;

  await connectDB();
  const dishes = await Dish.find({ restaurantId })
    .select("name slug sellPrice")
    .lean();

  if (!dishes.length) return null;

  const exact = dishes.find((row) => row.name.toLowerCase() === key.toLowerCase());
  if (exact) {
    return { name: exact.name, slug: exact.slug, sellPrice: Number(exact.sellPrice ?? 0) };
  }

  const slugGuess = dishSlugFromName(key);
  const bySlug = dishes.find((row) => row.slug === slugGuess);
  if (bySlug) {
    return { name: bySlug.name, slug: bySlug.slug, sellPrice: Number(bySlug.sellPrice ?? 0) };
  }

  const keyLower = key.toLowerCase();
  const substringMatches = dishes.filter(
    (row) =>
      row.name.toLowerCase().includes(keyLower) || keyLower.includes(row.name.toLowerCase())
  );
  if (substringMatches.length === 1) {
    const row = substringMatches[0];
    return { name: row.name, slug: row.slug, sellPrice: Number(row.sellPrice ?? 0) };
  }

  const scored = dishes
    .map((row) => ({
      row,
      score: scoreDishName(key, row.name, row.slug),
    }))
    .filter((entry) => entry.score >= 0.55)
    .sort((a, b) => b.score - a.score);

  if (!scored.length) return null;
  if (scored.length === 1 || scored[0].score >= 0.85) {
    const row = scored[0].row;
    return { name: row.name, slug: row.slug, sellPrice: Number(row.sellPrice ?? 0) };
  }

  return null;
}
