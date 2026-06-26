import { cleanMenuDishName } from "@backend/services/chat/chat-recipe-draft";
import { executeInventoryPendingAction } from "@backend/services/agents/agent-inventory-actions";
import { dishSlugFromName } from "@backend/services/catalog/dish-catalog";
import {
  buildIngredientSku,
  findExistingIngredient,
  basicPantryName,
} from "@backend/services/catalog/ingredient-identity";
import { normalizeIngredientLinks } from "@backend/services/catalog/dish-payload";
import { dishMissingPhotos } from "@backend/services/catalog/dish-image-status";
import { ingredientMissingPhotos } from "@backend/services/catalog/ingredient-image-status";
import { refreshIngredientLabels } from "@backend/services/catalog/ingredient-labels";
import {
  regenerateDishImages,
  type DishImageGenOverrides,
} from "@backend/services/catalog/regenerate-dish-images";
import { regenerateIngredientImages } from "@backend/services/catalog/regenerate-ingredient-images";
import { scheduleRecipeBuild } from "@backend/services/recipes/recipe-builder";
import type {
  RecipeBuildIngredientRow,
  RecipeBuildPlanPayload,
} from "@backend/services/recipes/recipe-build-plan";
import { formatRecipeBuildSelectionSummary } from "@backend/services/recipes/recipe-build-plan";
import { connectDB } from "@backend/services/infra/mongodb";
import { Dish } from "@backend/models/Dish";
import { Ingredient } from "@backend/models/Ingredient";
import { Recipe } from "@backend/models/Recipe";

export type {
  RecipeBuildIngredientOption,
  RecipeBuildIngredientRow,
  RecipeBuildPlanPayload,
} from "@backend/services/recipes/recipe-build-plan";

export {
  applyRecipeSelectionToPlan,
  ingredientsNeedingPick,
  isRecipeBuildReadyToFinalize,
} from "@backend/services/recipes/recipe-build-plan";

function ingredientSlugFromName(name: string): string {
  return `ing-${name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;
}

async function generateIngredientImagePair(
  restaurantId: string,
  slug: string
): Promise<{ name: string; ok: boolean; error?: string }> {
  const ing = await Ingredient.findOne({ restaurantId, slug });
  if (!ing) {
    return { name: slug, ok: false, error: "ingredient not found" };
  }
  if (!ingredientMissingPhotos(ing)) {
    if (!ing.imageGenerationAttempted) {
      ing.imageGenerationAttempted = true;
      await ing.save();
    }
    return { name: ing.name, ok: true };
  }
  try {
    await regenerateIngredientImages(ing, "pair");
    return { name: ing.name, ok: true };
  } catch (err) {
    return {
      name: ing.name,
      ok: false,
      error: err instanceof Error ? err.message : "image generation failed",
    };
  }
}

async function generateDishImagePair(
  restaurantId: string,
  dishSlug: string,
  overrides?: DishImageGenOverrides
): Promise<{ ok: boolean; error?: string }> {
  const dish = await Dish.findOne({ restaurantId, slug: dishSlug });
  if (!dish) {
    return { ok: false, error: "dish not found" };
  }
  if (dish.imageGenerationAttempted && !dishMissingPhotos(dish)) {
    return { ok: true };
  }
  try {
    await regenerateDishImages(dish, "pair", undefined, overrides);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "image generation failed",
    };
  }
}

async function ensureIngredient(
  restaurantId: string,
  row: RecipeBuildIngredientRow
): Promise<string> {
  const existingSlug = row.committedSlug || row.pantrySlug;
  if (existingSlug) {
    return existingSlug;
  }

  const pantryName = basicPantryName(row.name.trim());
  const inventoryUnit = row.unit || "each";
  const identity = {
    name: pantryName,
    inventoryUnit,
    rawName: row.name.trim(),
    sku: buildIngredientSku({
      name: pantryName,
      inventoryUnit,
      rawName: row.name.trim(),
    }),
  };

  const linked = await findExistingIngredient(restaurantId, identity);
  if (linked) return linked.slug;

  try {
    await executeInventoryPendingAction(restaurantId, {
      kind: "create_ingredient",
      ingredientName: pantryName,
      label: "new",
      inventoryUnit,
      currentQty: 0,
      category: "misc",
    });
  } catch (err) {
    const afterError = await findExistingIngredient(restaurantId, identity);
    if (afterError) return afterError.slug;
    throw err;
  }

  const created = await findExistingIngredient(restaurantId, identity);
  if (created) return created.slug;

  const slug = ingredientSlugFromName(pantryName);
  const bySlug = await Ingredient.findOne({ restaurantId, slug });
  if (bySlug) return bySlug.slug;

  const byName = await Ingredient.findOne({
    restaurantId,
    name: new RegExp(`^${pantryName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
  });
  if (byName) return byName.slug;

  throw new Error(`Could not create ingredient for **${pantryName}**.`);
}

export async function executeFinalizeRecipeBuild(
  restaurantId: string,
  plan: RecipeBuildPlanPayload
): Promise<string> {
  await connectDB();

  const dishName =
    cleanMenuDishName(plan.dishName?.trim() || "") || plan.dishName?.trim();
  if (!dishName) throw new Error("Recipe plan missing dish name.");
  const instructionSteps = (plan.instructions ?? [])
    .map((step) => String(step).trim())
    .filter(Boolean);

  const messages: string[] = [formatRecipeBuildSelectionSummary({ ...plan, dishName }), ""];
  const links: Array<{ ingredientSlug: string; qtyPerServing: number; unit: string }> = [];

  const seenIngredientKeys = new Set<string>();
  for (const row of plan.ingredients ?? []) {
    const pantryName = basicPantryName(row.name);
    const dedupeKey = pantryName.toLowerCase();
    if (seenIngredientKeys.has(dedupeKey)) continue;
    seenIngredientKeys.add(dedupeKey);
    const preExisting = await Ingredient.findOne({
      restaurantId,
      slug: ingredientSlugFromName(pantryName),
    })
      .select("slug")
      .lean();
    const slug = await ensureIngredient(restaurantId, row);
    links.push({
      ingredientSlug: slug,
      qtyPerServing: row.qtyPerServing ?? 1,
      unit: row.unit || "each",
    });
    const ing = await Ingredient.findOne({ restaurantId, slug }).select("name").lean();
    const verb = preExisting ? "Linked pantry item" : "Added pantry item";
    const photo = await generateIngredientImagePair(restaurantId, slug);
    const photoNote = photo.ok
      ? " — primary & secondary photos saved"
      : ` — photos pending (${photo.error ?? "retry in Kitchen control"})`;
    messages.push(
      `${verb} **${ing?.name ?? row.name}** (\`${slug}\`, qty 0, label new)${photoNote}.`
    );
  }

  const ingredientNames = (
    await Ingredient.find({
      restaurantId,
      slug: { $in: links.map((link) => link.ingredientSlug) },
    })
      .select("name")
      .lean()
  ).map((row) => row.name);

  const classification = plan.classification?.trim() || "other";
  const slug = dishSlugFromName(dishName);
  const dishImageOverrides: DishImageGenOverrides = {
    name: dishName,
    description: plan.description?.trim(),
    visualBrief: plan.visualBrief?.trim(),
    classification,
    ingredientNames,
  };
  const existing = await Dish.findOne({ restaurantId, slug });

  const ingredientLinks = normalizeIngredientLinks(
    links.map((link) => ({
      ingredientSlug: link.ingredientSlug,
      qtyPerServing: link.qtyPerServing,
      unit: link.unit,
      scalesWithSize: false,
    }))
  );

  if (existing) {
    existing.ingredientLinks = ingredientLinks;
    existing.description = plan.description?.trim() || existing.description;
    existing.classification = classification;
    existing.category = classification;
    if (plan.sellPrice != null) existing.sellPrice = plan.sellPrice;
    if (!existing.recipeStatus) existing.recipeStatus = "new";
    await existing.save();
    await refreshIngredientLabels(restaurantId);
    await Recipe.updateOne(
      { restaurantId, kind: "dish", targetSlug: slug },
      { $set: { instructions: instructionSteps, dishName } },
      { upsert: true }
    );
    if (ingredientLinks.length) scheduleRecipeBuild(restaurantId, "dish", slug);
    const dishPhoto = await generateDishImagePair(restaurantId, slug, dishImageOverrides);
    messages.push(
      `Updated dish **${dishName}** with ${ingredientLinks.length} linked ingredient(s) and recipe steps${
        dishPhoto.ok
          ? " — primary & secondary dish photos saved"
          : ` — dish photos pending (${dishPhoto.error ?? "retry in Kitchen control"})`
      }.`
    );
    messages.push("Open **Kitchen control** to review pantry, menu, and photos.");
    return messages.join("\n");
  }

  await Dish.create({
    restaurantId,
    slug,
    name: dishName,
    category: classification,
    classification,
    sellPrice: plan.sellPrice ?? 0,
    description: plan.description?.trim() || undefined,
    ingredientLinks,
    recipeStatus: "new",
    source: "agent_recipe_build",
    imageGenerationAttempted: false,
  });

  await refreshIngredientLabels(restaurantId);
  await Recipe.updateOne(
    { restaurantId, kind: "dish", targetSlug: slug },
    {
      $setOnInsert: {
        restaurantId,
        recipeNumber: await (async () => {
          const last = await Recipe.findOne({ restaurantId })
            .sort({ recipeNumber: -1 })
            .select("recipeNumber")
            .lean();
          return (last?.recipeNumber ?? 0) + 1;
        })(),
        kind: "dish",
        targetSlug: slug,
        dishName,
        servingQty: 1,
        ingredients: [],
        foodCost: 0,
        margin: 3,
        sellPrice: plan.sellPrice ?? 0,
        progress: "linking",
        recipeStatus: "new",
      },
      $set: {
        instructions: instructionSteps,
      },
    },
    { upsert: true }
  );
  const dishPhoto = await generateDishImagePair(restaurantId, slug, dishImageOverrides);
  if (ingredientLinks.length) scheduleRecipeBuild(restaurantId, "dish", slug);

  messages.push(
    `Created dish **${dishName}** with ${ingredientLinks.length} linked ingredient(s) and recipe steps${
      dishPhoto.ok
        ? " — primary & secondary dish photos saved"
        : ` — dish photos pending (${dishPhoto.error ?? "retry in Kitchen control"})`
    }.`
  );
  messages.push("Open **Kitchen control** to review pantry, menu, and photos.");
  return messages.join("\n");
}
