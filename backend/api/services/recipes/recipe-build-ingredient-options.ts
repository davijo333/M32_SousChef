import { fetchAgentImages } from "@backend/services/catalog/regenerate-ingredient-images";
import type { RecipeBuildIngredientOption } from "@backend/services/recipes/recipe-build-plan";
import { ingredientSearchQuery } from "@backend/services/recipes/recipe-build-plan";

const STORES = ["Costco", "Sysco", "Kroger", "Whole Foods", "US Foods"] as const;

function brandFromLabel(label: string): string {
  const parts = label.split(/[-–|]/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2 && parts[0].length <= 24) return parts[0];
  return "";
}

/** Fetch store product photos for recipe-build ingredient picker (and re-search). */
export async function fetchRecipeBuildIngredientOptions(params: {
  query: string;
  excludeUrls?: string[];
}): Promise<RecipeBuildIngredientOption[]> {
  const searchName = ingredientSearchQuery(params.query.trim());
  const options: RecipeBuildIngredientOption[] = [];
  const seen = new Set<string>();

  for (const store of STORES) {
    const images = await fetchAgentImages({
      name: searchName,
      count: 2,
      refresh: true,
      extraKeywords: `${store} grocery product`,
      excludeUrls: [...(params.excludeUrls ?? []), ...options.map((o) => o.imageUrl)],
    });

    for (const img of images) {
      const url = img.url?.trim();
      if (!url) continue;
      const key = url.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      options.push({
        label: img.label?.trim() || searchName,
        brandName: brandFromLabel(img.label ?? ""),
        store,
        imageUrl: url,
        score: img.score,
      });
    }

    if (options.length >= 6) break;
  }

  return options.slice(0, 6);
}
