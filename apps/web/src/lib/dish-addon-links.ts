import { AddOn } from "@/models/AddOn";

export async function linkedAddOnSlugsForDish(
  restaurantId: string,
  dishSlug: string
): Promise<string[]> {
  const addOns = await AddOn.find({
    restaurantId,
    linkedDishSlugs: dishSlug,
  })
    .select("slug")
    .lean();
  return addOns.map((a) => a.slug);
}

export async function syncDishAddOnLinks(
  restaurantId: string,
  dishSlug: string,
  addOnSlugs: string[]
): Promise<void> {
  const uniqueSlugs = Array.from(new Set(addOnSlugs.filter(Boolean)));

  await AddOn.updateMany(
    {
      restaurantId,
      linkedDishSlugs: dishSlug,
      slug: { $nin: uniqueSlugs },
    },
    { $pull: { linkedDishSlugs: dishSlug } }
  );

  if (uniqueSlugs.length === 0) return;

  await AddOn.updateMany(
    { restaurantId, slug: { $in: uniqueSlugs } },
    { $addToSet: { linkedDishSlugs: dishSlug } }
  );
}
