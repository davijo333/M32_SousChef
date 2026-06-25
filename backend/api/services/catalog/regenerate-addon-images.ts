import { applySelectedAddOnImage } from "@backend/services/catalog/dish-enrichment";
import { isValidProductImageUrl } from "@backend/services/catalog/image-selection";
import {
  IMAGE_FETCH_POOL_SIZE,
  persistCatalogSlotsFromPool,
  persistFirstAvailableCatalogImage,
  slotForImageIndex,
} from "@backend/services/catalog/persist-catalog-image-candidate";
import type { IAddOn } from "@backend/models/AddOn";
import { Ingredient } from "@backend/models/Ingredient";
import type { HydratedDocument } from "mongoose";

const AGENT_URL = process.env.AGENT_SERVICE_URL ?? "http://localhost:8000";

const MENU_PHOTO_GUIDELINES =
  "single plated dish one serving no brand logos no readable text no recipe title overlay on photo";

const ADDON_PHOTO_GUIDELINES =
  "single ingredient component only no sandwich no bread no packaging no brand logos no readable text. Examples: one cheese slice, crispy bacon strips, fried egg, diced veggies without bread, one espresso shot in small cup, dollop whipped cream";

type AgentImageSuggestion = {
  url: string;
  label?: string;
  source?: string;
  score?: number;
};

export type AddOnImageGenOverrides = {
  name?: string;
  classification?: string;
  description?: string;
  ingredientNames?: string[];
  ingredientLinks?: IAddOn["ingredientLinks"];
};

async function resolveIngredientNames(
  restaurantId: string,
  links: IAddOn["ingredientLinks"]
): Promise<string[]> {
  if (!links?.length) return [];
  const slugs = Array.from(new Set(links.map((link) => link.ingredientSlug)));
  const rows = await Ingredient.find({ restaurantId, slug: { $in: slugs } }).select("slug name").lean();
  const bySlug = new Map(rows.map((row) => [row.slug, row.name]));
  return slugs.map((slug) => bySlug.get(slug)).filter((name): name is string => Boolean(name));
}

async function fetchAddOnImages(params: {
  name: string;
  classification?: string;
  description?: string;
  ingredientNames?: string[];
  count: number;
  excludeUrls?: string[];
}): Promise<AgentImageSuggestion[]> {
  const extraKeywords = [params.description?.trim(), ADDON_PHOTO_GUIDELINES].filter(Boolean).join(". ");
  const res = await fetch(`${AGENT_URL}/suggest-images`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: params.name,
      item_type: "addon",
      brand_name: "",
      classification: params.classification?.trim() ?? "",
      extra_keywords: extraKeywords,
      ingredient_names: params.ingredientNames ?? [],
      count: params.count,
      refresh: true,
      exclude_urls: params.excludeUrls ?? [],
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || "Agent image request failed");
  }
  const data = (await res.json()) as { images?: AgentImageSuggestion[] };
  return (data.images ?? []).filter((img) => img.url && isValidProductImageUrl(img.url));
}

function slotForIndex(index: number) {
  return slotForImageIndex(index);
}

function applyOverrides(addOn: HydratedDocument<IAddOn>, overrides?: AddOnImageGenOverrides): void {
  if (!overrides) return;
  if (overrides.name?.trim()) addOn.name = overrides.name.trim();
  if (overrides.classification?.trim()) addOn.classification = overrides.classification.trim();
  if (overrides.description !== undefined) addOn.description = overrides.description;
  if (overrides.ingredientLinks) addOn.ingredientLinks = overrides.ingredientLinks;
}

export async function regenerateAddOnImages(
  addOn: HydratedDocument<IAddOn>,
  mode: "pair" | "secondary",
  selectedImageIndex?: number,
  overrides?: AddOnImageGenOverrides
): Promise<HydratedDocument<IAddOn>> {
  applyOverrides(addOn, overrides);
  addOn.imageGenerationAttempted = true;

  const name = overrides?.name?.trim() || addOn.name;
  const classification = overrides?.classification?.trim() || addOn.classification || "addon";
  const description = overrides?.description ?? addOn.description ?? "";
  const ingredientNames =
    overrides?.ingredientNames?.length
      ? overrides.ingredientNames
      : await resolveIngredientNames(addOn.restaurantId.toString(), addOn.ingredientLinks);

  const existing = addOn.imageCandidates ?? [];
  const slotCount = Math.max(existing.length, 2);
  const selected = Math.min(Math.max(selectedImageIndex ?? addOn.selectedImageIndex ?? 0, 0), slotCount - 1);
  addOn.selectedImageIndex = selected;
  const excludeUrls = [...existing.map((c) => c.url), ...(addOn.imageUrl ? [addOn.imageUrl] : [])];

  if (mode === "pair") {
    const fetched = await fetchAddOnImages({
      name,
      classification,
      description,
      ingredientNames,
      count: IMAGE_FETCH_POOL_SIZE,
      excludeUrls,
    });
    if (!fetched.length) throw new Error("No suitable add-on images found");
    const candidates = await persistCatalogSlotsFromPool("addons", addOn.slug, 2, fetched);
    addOn.imageCandidates = candidates;
    addOn.selectedImageIndex = 0;
    applySelectedAddOnImage(addOn);
    await addOn.save();
    return addOn;
  }

  const secondaryIndex = selected === 0 ? 1 : 0;
  const fetched = await fetchAddOnImages({
    name,
    classification,
    description,
    ingredientNames,
    count: IMAGE_FETCH_POOL_SIZE,
    excludeUrls,
  });
  if (!fetched.length) throw new Error("No suitable add-on images found");
  const { candidate: replacement } = await persistFirstAvailableCatalogImage(
    "addons",
    addOn.slug,
    slotForIndex(secondaryIndex),
    fetched
  );
  const next = [...existing];
  if (next.length === 0) {
    next.push(replacement);
    addOn.selectedImageIndex = 0;
  } else if (next.length === 1) {
    if (selected === 0) next.push(replacement);
    else {
      next.unshift(replacement);
      addOn.selectedImageIndex = 1;
    }
  } else {
    next[secondaryIndex] = replacement;
    addOn.selectedImageIndex = selected;
  }
  addOn.imageCandidates = next.slice(0, 2);
  applySelectedAddOnImage(addOn);
  await addOn.save();
  return addOn;
}
