import type { IBillLine } from "@/models/BillUpload";
import { AddOn } from "@/models/AddOn";
import { Dish } from "@/models/Dish";
import { deductRecipeIngredients } from "@/lib/sales-deduction";
import {
  billLineDescription,
  inferAddOnClassification,
  inferDishClassification,
} from "@/lib/catalog-classification";

export function dishSlugFromName(name: string): string {
  return `dish-${name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;
}

export function addOnSlugFromName(name: string): string {
  return `addon-${name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;
}

function isSkippableLine(name: string): boolean {
  const n = name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return !n || n === "tax" || n === "tip" || n === "total" || n === "subtotal";
}

type BillLineMutable = IBillLine & { stockApplied?: boolean };

export type CustomerLineIngestResult = {
  dishCreated: boolean;
  dishUpdated: boolean;
  addOnCreated: boolean;
  addOnUpdated: boolean;
  ingredientsDeducted: number;
};

export async function ingestCustomerLine(
  restaurantId: string,
  line: BillLineMutable,
  lastDishSlug?: string
): Promise<{ result: CustomerLineIngestResult; lastDishSlug?: string }> {
  const empty: CustomerLineIngestResult = {
    dishCreated: false,
    dishUpdated: false,
    addOnCreated: false,
    addOnUpdated: false,
    ingredientsDeducted: 0,
  };

  if (line.stockApplied) return { result: empty, lastDishSlug };
  if (!line.included || line.suggestedCategory !== "menu_item") {
    return { result: empty, lastDishSlug };
  }

  const name = (line.normalizedName ?? line.rawName).trim();
  if (isSkippableLine(name)) return { result: empty, lastDishSlug };

  const kind = line.menuItemKind ?? "dish";

  if (kind === "addon") {
    const classification =
      line.classification?.trim() ||
      inferAddOnClassification(name, line.rawName);
    const description =
      line.description?.trim() || billLineDescription(name, line.rawName);

    let addOn = line.matchedAddOnSlug
      ? await AddOn.findOne({ restaurantId, slug: line.matchedAddOnSlug })
      : null;
    if (!addOn) {
      const slug = addOnSlugFromName(name);
      addOn = await AddOn.findOne({ restaurantId, slug });
      if (addOn) line.matchedAddOnSlug = addOn.slug;
    }

    const linkedDishSlugs = lastDishSlug ? [lastDishSlug] : [];

    if (addOn) {
      if (lastDishSlug && !addOn.linkedDishSlugs.includes(lastDishSlug)) {
        addOn.linkedDishSlugs.push(lastDishSlug);
      }
      if (!addOn.classification || addOn.classification === "addon") {
        addOn.classification = classification;
      }
      if (!addOn.description && description) addOn.description = description;
      if (line.unitPrice > 0) addOn.sellPrice = line.unitPrice;
      addOn.totalSold = (addOn.totalSold ?? 0) + line.quantity;
      let ingredientsDeducted = 0;
      if (
        addOn.ingredientLinks?.length &&
        addOn.recipeStatus === "active"
      ) {
        ingredientsDeducted = await deductRecipeIngredients(
          restaurantId,
          addOn.ingredientLinks,
          line.quantity
        );
      }
      await addOn.save();
      line.matchedAddOnSlug = addOn.slug;
      line.stockApplied = true;
      return {
        result: { ...empty, addOnUpdated: true, ingredientsDeducted },
        lastDishSlug,
      };
    }

    const slug = addOnSlugFromName(name);
    await AddOn.create({
      restaurantId,
      slug,
      name,
      classification,
      description,
      sellPrice: line.unitPrice > 0 ? line.unitPrice : 0,
      linkedDishSlugs,
      ingredientLinks: [],
      source: "bill_upload",
    });
    line.matchedAddOnSlug = slug;
    line.normalizedName = name;
    line.stockApplied = true;
    return {
      result: { ...empty, addOnCreated: true },
      lastDishSlug,
    };
  }

  const classification =
    line.classification?.trim() || inferDishClassification(name, line.rawName);
  const description =
    line.description?.trim() || billLineDescription(name, line.rawName);

  let dish = line.matchedDishSlug
    ? await Dish.findOne({ restaurantId, slug: line.matchedDishSlug })
    : null;
  if (!dish) {
    const slug = dishSlugFromName(name);
    dish = await Dish.findOne({ restaurantId, slug });
    if (dish) line.matchedDishSlug = dish.slug;
  }

  if (dish) {
    if (!dish.classification || dish.classification === "other") {
      dish.classification = classification;
      dish.category = classification;
    }
    if (!dish.description && description) dish.description = description;
    if (line.unitPrice > 0) dish.sellPrice = line.unitPrice;
    dish.totalSold = (dish.totalSold ?? 0) + line.quantity;
    let ingredientsDeducted = 0;
    if (dish.ingredientLinks?.length && dish.recipeStatus === "active") {
      ingredientsDeducted = await deductRecipeIngredients(
        restaurantId,
        dish.ingredientLinks,
        line.quantity
      );
    }
    await dish.save();
    line.matchedDishSlug = dish.slug;
    line.stockApplied = true;
    return {
      result: { ...empty, dishUpdated: true, ingredientsDeducted },
      lastDishSlug: dish.slug,
    };
  }

  const slug = dishSlugFromName(name);
  await Dish.create({
    restaurantId,
    slug,
    name,
    classification,
    category: classification,
    description,
    sellPrice: line.unitPrice > 0 ? line.unitPrice : 0,
    ingredientLinks: [],
    source: "bill_upload",
  });
  line.matchedDishSlug = slug;
  line.normalizedName = name;
  line.stockApplied = true;
  return {
    result: { ...empty, dishCreated: true },
    lastDishSlug: slug,
  };
}

export async function ingestCustomerBill(
  restaurantId: string,
  lines: BillLineMutable[]
): Promise<{
  dishesCreated: number;
  dishesUpdated: number;
  addOnsCreated: number;
  addOnsUpdated: number;
  ingredientsDeducted: number;
}> {
  let dishesCreated = 0;
  let dishesUpdated = 0;
  let addOnsCreated = 0;
  let addOnsUpdated = 0;
  let ingredientsDeducted = 0;
  let lastDishSlug: string | undefined;

  for (const line of lines) {
    const { result, lastDishSlug: nextDish } = await ingestCustomerLine(
      restaurantId,
      line,
      lastDishSlug
    );
    if (result.dishCreated) dishesCreated += 1;
    if (result.dishUpdated) dishesUpdated += 1;
    if (result.addOnCreated) addOnsCreated += 1;
    if (result.addOnUpdated) addOnsUpdated += 1;
    ingredientsDeducted += result.ingredientsDeducted;
    if (nextDish) lastDishSlug = nextDish;
  }

  return {
    dishesCreated,
    dishesUpdated,
    addOnsCreated,
    addOnsUpdated,
    ingredientsDeducted,
  };
}
