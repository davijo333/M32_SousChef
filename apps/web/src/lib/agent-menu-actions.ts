import { dishSlugFromName } from "@/lib/dish-catalog";
import { syncDishAddOnLinks } from "@/lib/dish-addon-links";
import { normalizeIngredientLinks } from "@/lib/dish-payload";
import { refreshIngredientLabels } from "@/lib/ingredient-labels";
import { regenerateDishImages } from "@/lib/regenerate-dish-images";
import { regenerateIngredientImages } from "@/lib/regenerate-ingredient-images";
import { scheduleRecipeBuild } from "@/lib/recipe-builder";
import { connectDB } from "@/lib/mongodb";
import { persistCatalogImage } from "@/lib/r2-storage";
import { Dish } from "@/models/Dish";
import { Ingredient } from "@/models/Ingredient";
import type { AgentPendingAction } from "@/lib/agent-pending-actions";

export async function executeMenuPendingAction(
  restaurantId: string,
  action: AgentPendingAction
): Promise<string> {
  await connectDB();

  if (action.kind === "generate_dish_image") {
    const slug = action.slug?.trim();
    if (!slug) throw new Error("Dish slug required.");
    const dish = await Dish.findOne({ restaurantId, slug });
    if (!dish) throw new Error(`Dish '${slug}' not found.`);
    await regenerateDishImages(dish, action.imageMode === "secondary" ? "secondary" : "pair");
    return `Generated images for **${dish.name}**. Open Kitchen control to review.`;
  }

  if (action.kind === "generate_ingredient_image") {
    const slug = action.slug?.trim();
    if (!slug) throw new Error("Ingredient slug required.");
    const ing = await Ingredient.findOne({ restaurantId, slug });
    if (!ing) throw new Error(`Ingredient '${slug}' not found.`);
    await regenerateIngredientImages(ing, "pair");
    return `Generated images for **${ing.name}**. Open Kitchen control to review.`;
  }

  if (action.kind === "create_dish") {
    const name = action.dishName?.trim();
    if (!name) throw new Error("Dish name required.");
    const classification = action.classification?.trim() || "other";
    const slug = dishSlugFromName(name);
    const existing = await Dish.findOne({ restaurantId, slug });
    if (existing) throw new Error(`Dish '${name}' already exists.`);
    const ingredientLinks = normalizeIngredientLinks(
      (action.ingredientSlugs ?? []).map((ingredientSlug) => ({
        ingredientSlug,
        qtyPerServing: 1,
        unit: "each",
        scalesWithSize: false,
      }))
    );
    await Dish.create({
      restaurantId,
      slug,
      name,
      category: classification,
      classification,
      sellPrice: action.sellPrice ?? 0,
      description: action.description?.trim() || undefined,
      ingredientLinks,
      recipeStatus: ingredientLinks.length ? "new" : undefined,
      source: "agent_chat",
    });
    const dish = await Dish.findOne({ restaurantId, slug });
    if (!dish) throw new Error("Dish creation failed.");
    if (action.imageUrl?.startsWith("http")) {
      try {
        const stored = await persistCatalogImage("dishes", dish._id.toString(), action.imageUrl);
        dish.imageR2Key = stored.r2Key;
        dish.imageUrl = stored.publicUrl;
        dish.imageCandidates = [
          { url: stored.publicUrl, r2Key: stored.r2Key, source: "chat_upload" },
        ];
        dish.imageGenerationAttempted = true;
        await dish.save();
      } catch {
        dish.imageUrl = action.imageUrl;
        dish.imageGenerationAttempted = true;
        await dish.save();
      }
    }
    await refreshIngredientLabels(restaurantId);
    if (ingredientLinks.length) scheduleRecipeBuild(restaurantId, "dish", slug);
    try {
      await regenerateDishImages(dish, "pair");
    } catch {
      // Dish exists even if image generation fails
    }
    return `Created dish **${name}** in Kitchen control with generated images.`;
  }

  if (action.kind === "update_dish" || action.kind === "enrich_dish_description") {
    const slug = action.slug?.trim();
    if (!slug) throw new Error("Dish slug required.");
    const dish = await Dish.findOne({ restaurantId, slug });
    if (!dish) throw new Error(`Dish '${slug}' not found.`);
    if (action.dishName?.trim()) dish.name = action.dishName.trim();
    if (action.classification?.trim()) {
      dish.classification = action.classification.trim();
      dish.category = action.classification.trim();
    }
    if (action.description != null) dish.description = action.description.trim() || undefined;
    if (action.kind === "update_dish" && action.sellPrice != null) {
      dish.sellPrice = action.sellPrice;
    }
    if (action.imageUrl?.startsWith("http")) {
      try {
        const stored = await persistCatalogImage("dishes", dish._id.toString(), action.imageUrl);
        dish.imageR2Key = stored.r2Key;
        dish.imageUrl = stored.publicUrl;
        dish.imageCandidates = [
          { url: stored.publicUrl, r2Key: stored.r2Key, source: "chat_upload" },
        ];
        dish.imageGenerationAttempted = true;
      } catch {
        dish.imageUrl = action.imageUrl;
        dish.imageGenerationAttempted = true;
      }
    }
    await dish.save();
    return `Updated **${dish.name}**.`;
  }

  if (action.kind === "delete_dish") {
    const slug = action.slug?.trim();
    if (!slug) throw new Error("Dish slug required.");
    const dish = await Dish.findOne({ restaurantId, slug });
    if (!dish) throw new Error(`Dish '${slug}' not found.`);
    const dishName = dish.name;
    await Dish.deleteOne({ restaurantId, slug });
    await syncDishAddOnLinks(restaurantId, slug, []);
    await refreshIngredientLabels(restaurantId);
    return `Deleted dish **${dishName}**.`;
  }

  if (action.kind === "link_dish_ingredients") {
    const slug = action.slug?.trim();
    if (!slug) throw new Error("Dish slug required.");
    const dish = await Dish.findOne({ restaurantId, slug });
    if (!dish) throw new Error(`Dish '${slug}' not found.`);

    const mode = action.linkMode ?? "add";
    const tokens = action.ingredientSlugs ?? [];
    if (!tokens.length) throw new Error("No ingredient slugs provided.");

    for (const token of tokens) {
      const ing = await Ingredient.findOne({ restaurantId, slug: token });
      if (!ing) throw new Error(`Ingredient '${token}' not found.`);
    }

    const qty = action.qtyPerServing ?? 1;
    const unit = action.unit?.trim() || "each";
    const existing = dish.ingredientLinks ?? [];

    let nextLinks;
    if (mode === "set") {
      nextLinks = normalizeIngredientLinks(
        tokens.map((ingredientSlug) => ({
          ingredientSlug,
          qtyPerServing: qty,
          unit,
          scalesWithSize: false,
        }))
      );
    } else if (mode === "remove") {
      const removeSet = new Set(tokens);
      nextLinks = existing.filter((link) => !removeSet.has(link.ingredientSlug));
    } else {
      const existingSlugs = new Set(existing.map((link) => link.ingredientSlug));
      const toAdd = tokens.filter((token) => !existingSlugs.has(token));
      nextLinks = [
        ...existing,
        ...normalizeIngredientLinks(
          toAdd.map((ingredientSlug) => ({
            ingredientSlug,
            qtyPerServing: qty,
            unit,
            scalesWithSize: false,
          }))
        ),
      ];
    }

    dish.ingredientLinks = nextLinks;
    if (nextLinks.length && !dish.recipeStatus) {
      dish.recipeStatus = "new";
    }
    await dish.save();
    await refreshIngredientLabels(restaurantId);
    if (nextLinks.length) scheduleRecipeBuild(restaurantId, "dish", slug);

    const names = await Ingredient.find({ restaurantId, slug: { $in: tokens } })
      .select("name slug")
      .lean();
    const label = names.map((ing) => ing.name).join(", ") || tokens.join(", ");
    if (mode === "remove") {
      return `Removed ingredient link(s) from **${dish.name}**: ${label}.`;
    }
    if (mode === "set") {
      return `Set **${dish.name}** ingredients to: ${label}. Recipe build queued.`;
    }
    return `Linked to **${dish.name}**: ${label}. Recipe build queued.`;
  }

  if (action.kind === "update_dish_price") {
    const slug = action.slug?.trim();
    if (!slug || action.sellPrice == null) throw new Error("Invalid price update.");
    const dish = await Dish.findOne({ restaurantId, slug });
    if (!dish) throw new Error(`Dish '${slug}' not found.`);
    dish.sellPrice = action.sellPrice;
    await dish.save();
    return `Updated **${dish.name}** sell price to $${action.sellPrice.toFixed(2)}.`;
  }

  throw new Error(`Unsupported menu action: ${action.kind}`);
}
