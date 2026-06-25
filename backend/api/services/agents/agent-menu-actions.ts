import { dishSlugFromName, addOnSlugFromName } from "@backend/services/catalog/dish-catalog";
import { syncDishAddOnLinks } from "@backend/services/catalog/dish-addon-links";
import { normalizeIngredientLinks } from "@backend/services/catalog/dish-payload";
import { refreshIngredientLabels } from "@backend/services/catalog/ingredient-labels";
import { regenerateDishImages } from "@backend/services/catalog/regenerate-dish-images";
import { regenerateAddOnImages } from "@backend/services/catalog/regenerate-addon-images";
import { regenerateIngredientImages } from "@backend/services/catalog/regenerate-ingredient-images";
import { scheduleRecipeBuild } from "@backend/services/recipes/recipe-builder";
import { connectDB } from "@backend/services/infra/mongodb";
import { persistCatalogImage } from "@backend/services/infra/r2-storage";
import { Dish } from "@backend/models/Dish";
import { AddOn } from "@backend/models/AddOn";
import { Ingredient } from "@backend/models/Ingredient";
import { Recipe } from "@backend/models/Recipe";
import type { AgentPendingAction } from "@backend/services/agents/agent-pending-actions";

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

  if (action.kind === "create_addon") {
    const name = action.dishName?.trim();
    if (!name) throw new Error("Add-on name required.");
    const classification = action.classification?.trim() || "addon";
    const slug = addOnSlugFromName(name);
    const existing = await AddOn.findOne({ restaurantId, slug });
    if (existing) throw new Error(`Add-on '${name}' already exists.`);
    const ingredientLinks = normalizeIngredientLinks(
      (action.ingredientSlugs ?? []).map((ingredientSlug) => ({
        ingredientSlug,
        qtyPerServing: 1,
        unit: "each",
        scalesWithSize: false,
      }))
    );
    const linkedDishSlugs = (action.linkedDishSlugs ?? [])
      .map((token) => token.trim())
      .filter(Boolean);
    await AddOn.create({
      restaurantId,
      slug,
      name,
      classification,
      sellPrice: action.sellPrice ?? 0,
      description: action.description?.trim() || undefined,
      linkedDishSlugs,
      ingredientLinks,
      recipeStatus: ingredientLinks.length ? "new" : undefined,
      source: "agent_chat",
    });
    const addOn = await AddOn.findOne({ restaurantId, slug });
    if (!addOn) throw new Error("Add-on creation failed.");
    if (action.imageUrl?.startsWith("http")) {
      try {
        const stored = await persistCatalogImage("addons", addOn._id.toString(), action.imageUrl);
        addOn.imageR2Key = stored.r2Key;
        addOn.imageUrl = stored.publicUrl;
        addOn.imageCandidates = [
          { url: stored.publicUrl, r2Key: stored.r2Key, source: "chat_upload" },
        ];
        addOn.imageGenerationAttempted = true;
        await addOn.save();
      } catch {
        addOn.imageUrl = action.imageUrl;
        addOn.imageGenerationAttempted = true;
        await addOn.save();
      }
    }
    await refreshIngredientLabels(restaurantId);
    if (ingredientLinks.length) scheduleRecipeBuild(restaurantId, "addon", slug);
    try {
      await regenerateAddOnImages(addOn, "pair");
    } catch {
      // Add-on exists even if image generation fails
    }
    return `Created add-on **${name}** in Kitchen control with generated images.`;
  }

  if (action.kind === "update_addon") {
    const slug = action.slug?.trim();
    if (!slug) throw new Error("Add-on slug required.");
    const addOn = await AddOn.findOne({ restaurantId, slug });
    if (!addOn) throw new Error(`Add-on '${slug}' not found.`);
    if (action.dishName?.trim()) addOn.name = action.dishName.trim();
    if (action.classification?.trim()) {
      addOn.classification = action.classification.trim();
    }
    if (action.description != null) addOn.description = action.description.trim() || undefined;
    if (action.sellPrice != null) addOn.sellPrice = action.sellPrice;
    if (action.linkedDishSlugs != null) {
      addOn.linkedDishSlugs = action.linkedDishSlugs.map((token) => token.trim()).filter(Boolean);
    }
    if (action.imageUrl?.startsWith("http")) {
      try {
        const stored = await persistCatalogImage("addons", addOn._id.toString(), action.imageUrl);
        addOn.imageR2Key = stored.r2Key;
        addOn.imageUrl = stored.publicUrl;
        addOn.imageCandidates = [
          { url: stored.publicUrl, r2Key: stored.r2Key, source: "chat_upload" },
        ];
        addOn.imageGenerationAttempted = true;
      } catch {
        addOn.imageUrl = action.imageUrl;
        addOn.imageGenerationAttempted = true;
      }
    }
    await addOn.save();
    await refreshIngredientLabels(restaurantId);
    return `Updated add-on **${addOn.name}**.`;
  }

  if (action.kind === "delete_addon") {
    const slug = action.slug?.trim();
    if (!slug) throw new Error("Add-on slug required.");
    const addOn = await AddOn.findOne({ restaurantId, slug });
    if (!addOn) throw new Error(`Add-on '${slug}' not found.`);
    const addOnName = addOn.name;
    await AddOn.deleteOne({ restaurantId, slug });
    await Recipe.deleteOne({ restaurantId, kind: "addon", targetSlug: slug });
    await refreshIngredientLabels(restaurantId);
    return `Deleted add-on **${addOnName}**.`;
  }

  if (action.kind === "link_addon_ingredients") {
    const slug = action.slug?.trim();
    if (!slug) throw new Error("Add-on slug required.");
    const addOn = await AddOn.findOne({ restaurantId, slug });
    if (!addOn) throw new Error(`Add-on '${slug}' not found.`);

    const mode = action.linkMode ?? "add";
    const tokens = action.ingredientSlugs ?? [];
    if (!tokens.length) throw new Error("No ingredient slugs provided.");

    for (const token of tokens) {
      const ing = await Ingredient.findOne({ restaurantId, slug: token });
      if (!ing) throw new Error(`Ingredient '${token}' not found.`);
    }

    const qty = action.qtyPerServing ?? 1;
    const unit = action.unit?.trim() || "each";
    const existing = addOn.ingredientLinks ?? [];

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

    addOn.ingredientLinks = nextLinks;
    if (nextLinks.length && !addOn.recipeStatus) {
      addOn.recipeStatus = "new";
    }
    await addOn.save();
    await refreshIngredientLabels(restaurantId);
    if (nextLinks.length) scheduleRecipeBuild(restaurantId, "addon", slug);

    const names = await Ingredient.find({ restaurantId, slug: { $in: tokens } })
      .select("name slug")
      .lean();
    const label = names.map((ing) => ing.name).join(", ") || tokens.join(", ");
    if (mode === "remove") {
      return `Removed ingredient link(s) from add-on **${addOn.name}**: ${label}.`;
    }
    if (mode === "set") {
      return `Set add-on **${addOn.name}** ingredients to: ${label}. Recipe build queued.`;
    }
    return `Linked to add-on **${addOn.name}**: ${label}. Recipe build queued.`;
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

/** Business-style margin pass after a dish is built (read-only suggestion). */
export async function suggestDishPriceMargin(
  restaurantId: string,
  dishName: string
): Promise<string | null> {
  await connectDB();
  const dish = await Dish.findOne({
    restaurantId,
    name: new RegExp(`^${dishName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
  })
    .select("name slug sellPrice")
    .lean();
  if (!dish) return null;

  const recipe = await Recipe.findOne({
    restaurantId,
    kind: "dish",
    targetSlug: dish.slug,
  })
    .select("foodCost sellPrice")
    .lean();

  const sell = Number(dish.sellPrice ?? recipe?.sellPrice ?? 0);
  const cost = Number(recipe?.foodCost ?? 0);
  if (sell <= 0) {
    return (
      `**${dish.name}** has no sell price yet. Set one in Kitchen control, ` +
      "or say **update the price** after food cost is calculated."
    );
  }
  if (cost <= 0) {
    return (
      `**${dish.name}** sells at $${sell.toFixed(2)} but food cost is still calculating. ` +
      "Check back in Recipes once linking finishes."
    );
  }
  const margin = sell - cost;
  const pct = (margin / sell) * 100;
  const targetPct = 65;
  const suggested = Math.round((cost / (1 - targetPct / 100)) * 100) / 100;
  if (pct >= targetPct) {
    return (
      `**${dish.name}**: $${sell.toFixed(2)} sell · $${cost.toFixed(2)} cost · ` +
      `$${margin.toFixed(2)} margin (${pct.toFixed(0)}%) — healthy; no change needed.`
    );
  }
  return (
    `**${dish.name}**: $${sell.toFixed(2)} sell · $${cost.toFixed(2)} cost · ` +
    `$${margin.toFixed(2)} margin (${pct.toFixed(0)}%) — below target.\n` +
    `Suggested price for ~${targetPct}% margin: **$${suggested.toFixed(2)}**. ` +
    "Say **yes, update the price** to apply."
  );
}
