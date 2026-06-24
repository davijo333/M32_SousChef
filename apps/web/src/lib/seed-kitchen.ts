import fs from "fs";
import path from "path";
import { dishClassKey } from "@/lib/catalog-classification";
import { buildIngredientSku } from "@/lib/ingredient-identity";
import { AddOn } from "@/models/AddOn";
import { Dish, type RecipeStatus } from "@/models/Dish";
import { Ingredient, type IngredientLabel } from "@/models/Ingredient";
import { Recipe } from "@/models/Recipe";
import { ensureRecipesForRestaurant } from "@/lib/recipe-builder";
import { attachSeedCatalogImages } from "@/lib/seed-catalog-images";

function resolveInventoryRoot(): string {
  const candidates = [
    path.join(process.cwd(), "test/inventory"),
    path.join(process.cwd(), "../../test/inventory"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "ingredients.json"))) return candidate;
  }
  throw new Error("Could not find test/inventory (ingredients.json)");
}

type SeedIngredient = {
  slug: string;
  name: string;
  brand?: string;
  inventoryUnit: string;
  category: string;
  currentQty?: number;
  reorderThreshold?: number;
  lastPurchasePrice?: number;
  expiryDate?: string;
  label?: IngredientLabel;
};

type SeedDish = {
  slug: string;
  name: string;
  classification: string;
  sellPrice: number;
  posName?: string;
  description?: string;
  ingredientSlugs?: string[];
  ingredientLinks?: Array<{
    ingredientSlug: string;
    qtyPerServing: number;
    unit: string;
    scalesWithSize?: boolean;
  }>;
  recipeStatus?: RecipeStatus;
};

type SeedAddOn = {
  slug: string;
  name: string;
  classification: string;
  description?: string;
  sellPrice: number;
  posName?: string;
  ingredientSlugs?: string[];
  ingredientLinks?: Array<{
    ingredientSlug: string;
    qtyPerServing: number;
    unit: string;
    scalesWithSize?: boolean;
  }>;
  linkedDishClassifications?: string[];
};

function loadJson<T>(filename: string): T {
  const filePath = path.join(resolveInventoryRoot(), filename);
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
}

function defaultIngredientQty(category: string): number {
  if (category === "produce") return 6;
  if (category === "protein") return 8;
  if (category === "bakery") return 10;
  return 12;
}

function defaultReorderThreshold(category: string): number {
  if (category === "produce") return 2;
  return 3;
}

function dishMatchesLinkedClasses(
  dishClassification: string,
  linkedClasses: string[]
): boolean {
  const normalized = dishClassification.trim().toLowerCase();
  const classKey = dishClassKey(dishClassification);
  return linkedClasses.some((raw) => {
    const linked = raw.trim().toLowerCase();
    if (linked === normalized || linked === classKey) return true;
    if (
      linked === "beverage" &&
      (classKey === "beverage" || ["coffee", "tea", "juice"].includes(normalized))
    ) {
      return true;
    }
    if (linked === "sandwich" && normalized === "byo-sandwich") return true;
    return false;
  });
}

const ACTIVE_DISH_SLUGS = new Set([
  "dish-sunrise-stack",
  "dish-garden-morning-croissant",
  "dish-farmers-double",
  "dish-build-your-own-croissant",
  "dish-build-your-own-sourdough",
  "dish-build-your-own-bagel",
  "dish-hot-coffee",
  "dish-lavazza-house-coffee",
  "dish-oat-vanilla-coffee",
  "dish-hazelnut-mocha",
  "dish-vanilla-cappuccino",
  "dish-english-breakfast-tea",
  "dish-orange-juice",
  "dish-classic-bagel",
  "dish-veggie-croissant",
]);

const SUGGESTED_DISH_SLUGS = new Set([
  "dish-multigrain-bagel",
  "dish-soy-coffee",
  "dish-cranberry-juice",
]);

const SEED_SUGGESTION_NOTES: Record<
  string,
  Array<{ kind: "expiring_ingredients" | "seasonal" | "high_margin" | "cue" | "other"; text: string }>
> = {
  "dish-multigrain-bagel": [
    {
      kind: "seasonal",
      text: "Whole-grain breakfast option aligned with fall wellness trends.",
    },
    { kind: "high_margin", text: "Uses high-margin bagel and cream cheese pantry staples." },
  ],
  "dish-soy-coffee": [
    { kind: "cue", text: "Plant-based coffee special for today's café crowd." },
    { kind: "high_margin", text: "Coffee and soy milk are strong margin ingredients." },
  ],
  "dish-cranberry-juice": [
    { kind: "seasonal", text: "Seasonal cranberry offer for holiday-adjacent menus." },
    { kind: "expiring_ingredients", text: "Uses cranberry concentrate before next delivery cycle." },
  ],
};

function ingredientLinks(
  slugs: string[] | undefined,
  links:
    | Array<{
        ingredientSlug: string;
        qtyPerServing: number;
        unit: string;
        scalesWithSize?: boolean;
      }>
    | undefined
) {
  if (links?.length) {
    return links.map((link) => ({
      ingredientSlug: link.ingredientSlug,
      qtyPerServing: link.qtyPerServing,
      unit: link.unit,
      scalesWithSize: link.scalesWithSize ?? false,
    }));
  }
  return (slugs ?? []).map((ingredientSlug) => ({
    ingredientSlug,
    qtyPerServing: 1,
    unit: "each",
    scalesWithSize: false,
  }));
}

function resolveDishRecipeStatus(dish: SeedDish): RecipeStatus {
  if (dish.recipeStatus) return dish.recipeStatus;
  if (SUGGESTED_DISH_SLUGS.has(dish.slug)) return "suggested";
  if (ACTIVE_DISH_SLUGS.has(dish.slug)) return "active";
  return "new";
}

function resolveIngredientLabel(
  slug: string,
  usedSlugs: Set<string>,
  ingredient: SeedIngredient
): IngredientLabel {
  if (ingredient.label) return ingredient.label;
  if (!usedSlugs.has(slug) && (ingredient.currentQty ?? 0) === 0) return "new";
  return usedSlugs.has(slug) ? "used" : "unused";
}

export type SeedKitchenResult = {
  ingredients: number;
  dishes: number;
  addOns: number;
  recipes: number;
};

export async function seedKitchenCatalog(restaurantId: string): Promise<SeedKitchenResult> {
  const ingredientsDoc = loadJson<{ ingredients: SeedIngredient[] }>("ingredients.json");
  const dishesDoc = loadJson<{ dishes: SeedDish[] }>("dishes.json");
  const addOnsDoc = loadJson<{ addOns: SeedAddOn[] }>("add-ons.json");

  await Promise.all([
    Ingredient.deleteMany({ restaurantId }),
    Dish.deleteMany({ restaurantId }),
    AddOn.deleteMany({ restaurantId }),
    Recipe.deleteMany({ restaurantId }),
  ]);

  const soon = new Date();
  soon.setHours(soon.getHours() + 36);
  const expiringSoon = new Date();
  expiringSoon.setDate(expiringSoon.getDate() + 5);

  const usedIngredientSlugs = new Set<string>();
  for (const dish of dishesDoc.dishes) {
    for (const slug of dish.ingredientSlugs ?? []) {
      usedIngredientSlugs.add(slug);
    }
  }
  for (const addOn of addOnsDoc.addOns) {
    for (const slug of addOn.ingredientSlugs ?? []) {
      usedIngredientSlugs.add(slug);
    }
  }

  for (const ing of ingredientsDoc.ingredients) {
    const category = ing.category;
    const expiryDate =
      ing.expiryDate != null
        ? new Date(ing.expiryDate)
        : ing.slug === "ing-spinach"
          ? soon
          : ing.slug === "ing-tomato" || ing.slug === "ing-bell-pepper"
            ? expiringSoon
            : null;
    const sku = buildIngredientSku({
      brandName: ing.brand,
      name: ing.name,
      inventoryUnit: ing.inventoryUnit,
      rawName: ing.name,
    });

    const ingredient = await Ingredient.create({
      restaurantId,
      slug: ing.slug,
      sku,
      name: ing.name,
      brandName: ing.brand,
      category,
      inventoryUnit: ing.inventoryUnit,
      currentQty: ing.currentQty ?? defaultIngredientQty(category),
      reorderThreshold: ing.reorderThreshold ?? defaultReorderThreshold(category),
      lastPurchasePrice: ing.lastPurchasePrice,
      expiryDate,
      source: "seed",
      label: resolveIngredientLabel(ing.slug, usedIngredientSlugs, ing),
      imageGenerationAttempted: true,
      usageUnits: [{ unit: ing.inventoryUnit, countPerInventoryUnit: 1 }],
    });
    if (await attachSeedCatalogImages(ingredient, "ingredients")) {
      await ingredient.save();
    }
  }

  const dishRows: Array<{ slug: string; classification: string }> = [];

  for (const dish of dishesDoc.dishes) {
    const classification = dish.classification;
    const description = dish.description ?? dish.posName;
    const dishDoc = await Dish.create({
      restaurantId,
      slug: dish.slug,
      name: dish.name,
      classification,
      category: classification,
      description,
      sellPrice: dish.sellPrice,
      ingredientLinks: ingredientLinks(dish.ingredientSlugs, dish.ingredientLinks),
      recipeStatus: resolveDishRecipeStatus(dish),
      suggestionNotes: SEED_SUGGESTION_NOTES[dish.slug] ?? [],
      source: "seed",
      imageGenerationAttempted: false,
    });
    if (await attachSeedCatalogImages(dishDoc, "dishes")) {
      await dishDoc.save();
    }
    dishRows.push({ slug: dish.slug, classification });
  }

  for (const addOn of addOnsDoc.addOns) {
    const linkedDishSlugs = dishRows
      .filter((dish) =>
        dishMatchesLinkedClasses(dish.classification, addOn.linkedDishClassifications ?? [])
      )
      .map((dish) => dish.slug);

    const addOnDoc = await AddOn.create({
      restaurantId,
      slug: addOn.slug,
      name: addOn.name,
      classification: addOn.classification,
      description: addOn.description ?? addOn.posName,
      sellPrice: addOn.sellPrice,
      linkedDishSlugs,
      ingredientLinks: ingredientLinks(addOn.ingredientSlugs, addOn.ingredientLinks),
      recipeStatus: "new",
      source: "seed",
      imageGenerationAttempted: false,
    });
    if (await attachSeedCatalogImages(addOnDoc, "addons")) {
      await addOnDoc.save();
    }
  }

  const recipesBuilt = await ensureRecipesForRestaurant(restaurantId);

  return {
    ingredients: ingredientsDoc.ingredients.length,
    dishes: dishesDoc.dishes.length,
    addOns: addOnsDoc.addOns.length,
    recipes: recipesBuilt,
  };
}
