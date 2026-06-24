import { applySelectedAddOnImage } from "@/lib/dish-enrichment";
import { isValidProductImageUrl } from "@/lib/image-selection";
import {
  persistCatalogImageCandidate,
  slotForImageIndex,
} from "@/lib/persist-catalog-image-candidate";
import type { IAddOn } from "@/models/AddOn";
import type { IImageCandidate } from "@/models/Ingredient";
import { Ingredient } from "@/models/Ingredient";
import type { HydratedDocument } from "mongoose";

const AGENT_URL = process.env.AGENT_SERVICE_URL ?? "http://localhost:8000";

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
  const res = await fetch(`${AGENT_URL}/suggest-images`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: params.name,
      item_type: "dish",
      brand_name: "",
      extra_keywords: params.description?.trim() || params.classification?.trim() || "",
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

async function persistCandidate(
  slug: string,
  index: number,
  img: AgentImageSuggestion
): Promise<IImageCandidate> {
  return persistCatalogImageCandidate("addons", slug, slotForIndex(index), img);
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
      count: 2,
      excludeUrls,
    });
    if (!fetched.length) throw new Error("No suitable add-on images found");
    const candidates: IImageCandidate[] = [];
    for (let i = 0; i < Math.min(2, fetched.length); i++) {
      candidates.push(await persistCandidate(addOn.slug, i, fetched[i]));
    }
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
    count: 1,
    excludeUrls,
  });
  if (!fetched.length) throw new Error("No suitable add-on images found");
  const replacement = await persistCandidate(addOn.slug, secondaryIndex, fetched[0]);
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
