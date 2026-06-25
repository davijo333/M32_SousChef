import {
  applyIngredientStockUpdate,
  buildIngredientSku,
  findExistingIngredient,
} from "@backend/services/catalog/ingredient-identity";
import { refreshIngredientLabels } from "@backend/services/catalog/ingredient-labels";
import { regenerateIngredientImages } from "@backend/services/catalog/regenerate-ingredient-images";
import { connectDB } from "@backend/services/infra/mongodb";
import { persistCatalogImage } from "@backend/services/infra/r2-storage";
import { AddOn } from "@backend/models/AddOn";
import { Dish } from "@backend/models/Dish";
import { Ingredient } from "@backend/models/Ingredient";
import type { AgentPendingAction } from "@backend/services/agents/agent-pending-actions";

function ingredientSlugFromName(name: string): string {
  return `ing-${name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;
}

export async function executeInventoryPendingAction(
  restaurantId: string,
  action: AgentPendingAction
): Promise<string> {
  await connectDB();

  if (action.kind === "create_ingredient") {
    const ingName = action.ingredientName?.trim();
    if (!ingName) throw new Error("Ingredient name required.");
    const inventoryUnit = action.inventoryUnit?.trim() || "each";
    const brandName = action.brandName?.trim() || undefined;
    const addQty = 0;
    const sku = buildIngredientSku({
      brandName,
      name: ingName,
      inventoryUnit,
      rawName: ingName,
    });

    const existing = await findExistingIngredient(restaurantId, {
      brandName,
      name: ingName,
      inventoryUnit,
      rawName: ingName,
      sku,
    });
    if (existing) {
      applyIngredientStockUpdate(existing, {
        addQty,
        brandName,
        sku,
      });
      if (action.reorderThreshold != null) {
        existing.reorderThreshold = action.reorderThreshold;
      }
      if (action.category?.trim()) existing.category = action.category.trim();
      await existing.save();
      return `Updated existing pantry item **${existing.name}** (${existing.slug}).`;
    }

    const slug = ingredientSlugFromName(ingName);
    const slugConflict = await Ingredient.findOne({ restaurantId, slug });
    if (slugConflict) {
      throw new Error(`Ingredient slug '${slug}' already exists.`);
    }

    const ingredient = await Ingredient.create({
      restaurantId,
      slug,
      sku,
      name: ingName,
      category: action.category?.trim() || "misc",
      inventoryUnit,
      currentQty: addQty,
      reorderThreshold: action.reorderThreshold ?? 1,
      brandName,
      label: action.label ?? "new",
      source: "agent_chat",
      imageGenerationAttempted: false,
      usageUnits: [{ unit: inventoryUnit, countPerInventoryUnit: 1 }],
    });

    if (action.imageUrl?.startsWith("http")) {
      try {
        const stored = await persistCatalogImage(
          "ingredients",
          ingredient._id.toString(),
          action.imageUrl
        );
        ingredient.imageR2Key = stored.r2Key;
        ingredient.imageUrl = stored.publicUrl;
        ingredient.imageCandidates = [
          { url: stored.publicUrl, r2Key: stored.r2Key, source: "chat_upload" },
        ];
        ingredient.imageGenerationAttempted = true;
        await ingredient.save();
      } catch {
        ingredient.imageUrl = action.imageUrl;
        ingredient.imageGenerationAttempted = true;
        await ingredient.save();
      }
    } else {
      try {
        await regenerateIngredientImages(ingredient, "pair");
      } catch {
        ingredient.imageGenerationAttempted = true;
        await ingredient.save();
      }
    }
    await refreshIngredientLabels(restaurantId);
    return `Created pantry item **${ingredient.name}** (${ingredient.slug}) with generated photos.`;
  }

  if (action.kind === "update_ingredient") {
    const slug = action.slug?.trim();
    if (!slug) throw new Error("Ingredient slug required.");
    const ing = await Ingredient.findOne({ restaurantId, slug });
    if (!ing) throw new Error(`Ingredient '${slug}' not found.`);

    if (action.ingredientName?.trim()) ing.name = action.ingredientName.trim();
    if (action.category?.trim()) ing.category = action.category.trim();
    if (action.inventoryUnit?.trim()) ing.inventoryUnit = action.inventoryUnit.trim();
    if (action.currentQty != null) ing.currentQty = action.currentQty;
    if (action.reorderThreshold != null) ing.reorderThreshold = action.reorderThreshold;
    if (action.brandName !== undefined) {
      ing.brandName = action.brandName.trim() || undefined;
    }
    await ing.save();
    return `Updated **${ing.name}** (${ing.slug}).`;
  }

  if (action.kind === "delete_ingredient") {
    const slug = action.slug?.trim();
    if (!slug) throw new Error("Ingredient slug required.");
    const ing = await Ingredient.findOne({ restaurantId, slug });
    if (!ing) throw new Error(`Ingredient '${slug}' not found.`);

    const dishes = await Dish.find({
      restaurantId,
      "ingredientLinks.ingredientSlug": slug,
    });
    for (const dish of dishes) {
      dish.ingredientLinks = (dish.ingredientLinks ?? []).filter(
        (link) => link.ingredientSlug !== slug
      );
      await dish.save();
    }

    const addOns = await AddOn.find({
      restaurantId,
      "ingredientLinks.ingredientSlug": slug,
    });
    for (const addOn of addOns) {
      addOn.ingredientLinks = (addOn.ingredientLinks ?? []).filter(
        (link) => link.ingredientSlug !== slug
      );
      await addOn.save();
    }

    await Ingredient.deleteOne({ restaurantId, slug });
    await refreshIngredientLabels(restaurantId);
    return `Removed **${ing.name}** from pantry and unlinked it from menu items.`;
  }

  throw new Error(`Unsupported inventory action: ${action.kind}`);
}
