import { dishSlugFromName } from "@/lib/dish-catalog";
import { normalizeIngredientLinks } from "@/lib/dish-payload";
import { refreshIngredientLabels } from "@/lib/ingredient-labels";
import { regenerateDishImages } from "@/lib/regenerate-dish-images";
import { regenerateIngredientImages } from "@/lib/regenerate-ingredient-images";
import { scheduleRecipeBuild } from "@/lib/recipe-builder";
import { connectDB } from "@/lib/mongodb";
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
    await refreshIngredientLabels(restaurantId);
    if (ingredientLinks.length) scheduleRecipeBuild(restaurantId, "dish", slug);
    return `Created dish **${name}** in Kitchen control.`;
  }

  if (action.kind === "update_dish" || action.kind === "enrich_dish_description") {
    const slug = action.slug?.trim();
    if (!slug) throw new Error("Dish slug required.");
    const dish = await Dish.findOne({ restaurantId, slug });
    if (!dish) throw new Error(`Dish '${slug}' not found.`);
    if (action.description != null) dish.description = action.description.trim() || undefined;
    if (action.kind === "update_dish" && action.sellPrice != null) {
      dish.sellPrice = action.sellPrice;
    }
    await dish.save();
    return `Updated **${dish.name}**.`;
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
