"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { KitchenAddOnModal } from "@/components/KitchenAddOnModal";
import { KitchenCard, KITCHEN_CARD_TWO_ROW_SCROLL_CLASS } from "@/components/KitchenCard";
import { KitchenClassifiedGrid } from "@/components/KitchenClassifiedGrid";
import { KitchenDishModal } from "@/components/KitchenDishModal";
import { KitchenIngredientModal, type IngredientDetail } from "@/components/KitchenIngredientModal";
import { PantryFiltersBar } from "@/components/PantryFiltersBar";
import { MenuFiltersBar } from "@/components/MenuFiltersBar";
import { Nav } from "@/components/Nav";
import { SousChefChatDock } from "@/components/SousChefChatDock";
import { NewItemsEnrichingPanel } from "@/components/NewItemsEnrichingPanel";
import { NewItemsReview } from "@/components/NewItemsReview";
import { ingredientMissingPhotos } from "@backend/services/catalog/ingredient-image-status";
import { dishMissingPhotos } from "@backend/services/catalog/dish-image-status";
import {
  matchesAnyPantryStatus,
  PANTRY_STATUS_OPTIONS,
  type PantryStatus,
} from "@backend/services/catalog/ingredient-pantry-status";
import {
  dishClassKey,
  dishClassLabel,
  dishSubclassKey,
  formatClassificationLabel,
  groupByClassSubclass,
  ingredientClassKey,
  ingredientClassLabel,
  ingredientSubclassKey,
} from "@backend/services/catalog/catalog-classification";
import type { DishDetail, DishIngredientLink } from "@backend/services/catalog/dish-payload";
import type { IngredientLabel } from "@backend/models/Ingredient";
import { useNewCatalogReview, NEW_CATALOG_EVENT } from "@/lib/use-new-catalog-review";

type IngredientRow = IngredientDetail & {
  category: string;
  label?: IngredientLabel;
};

type MenuItemRow = {
  kind: "dish" | "addon";
  slug: string;
  name: string;
  sellPrice: number;
  totalSold: number;
  soldThisWeek: number;
  recipeStatus: string;
  category: string;
  classification?: string;
  description?: string;
  imageUrl?: string;
  imageCandidates?: DishDetail["imageCandidates"];
  selectedImageIndex?: number;
  imageGenerationAttempted?: boolean;
  missingPhotos?: boolean;
  ingredientLinks?: DishIngredientLink[];
  linkedAddOnSlugs?: string[];
  linkedDishSlugs?: string[];
};

type AddOnModalState = {
  slug: string;
  name: string;
  classification?: string;
  description?: string;
  sellPrice: number;
  imageUrl?: string;
  imageCandidates?: DishDetail["imageCandidates"];
  selectedImageIndex?: number;
  imageGenerationAttempted?: boolean;
  ingredientLinks?: DishIngredientLink[];
  linkedDishSlugs?: string[];
  isNew?: boolean;
};

type KitchenViewTab = "menu" | "pantry" | "both";

type KitchenPayload = {
  restaurant: { name: string; isSeeded: boolean };
  orderStats?: {
    purchaseOrderCount: number;
    salesOrderCount: number;
    hasOrders: boolean;
  };
  ingredients: IngredientRow[];
  menuItems: MenuItemRow[];
};

export default function KitchenControlPage() {
  const router = useRouter();
  const review = useNewCatalogReview();
  const [data, setData] = useState<KitchenPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [ingredientModal, setIngredientModal] = useState<IngredientRow | null>(null);
  const [dishModal, setDishModal] = useState<DishDetail | null>(null);
  const [addOnModal, setAddOnModal] = useState<AddOnModalState | null>(null);
  const [selectedDishSlug, setSelectedDishSlug] = useState<string | null>(null);
  const [bulkGenerating, setBulkGenerating] = useState(false);
  const [bulkMessage, setBulkMessage] = useState("");
  const [dishBulkGenerating, setDishBulkGenerating] = useState(false);
  const [dishBulkMessage, setDishBulkMessage] = useState("");
  const [addOnBulkGenerating, setAddOnBulkGenerating] = useState(false);
  const [addOnBulkMessage, setAddOnBulkMessage] = useState("");
  const [pantrySearch, setPantrySearch] = useState("");
  const [brandFilters, setBrandFilters] = useState<string[]>([]);
  const [departmentFilters, setDepartmentFilters] = useState<string[]>([]);
  const [categoryFilters, setCategoryFilters] = useState<string[]>([]);
  const [statusFilters, setStatusFilters] = useState<string[]>([]);
  const [menuSearch, setMenuSearch] = useState("");
  const [menuClassFilters, setMenuClassFilters] = useState<string[]>([]);
  const [menuRecipeStatusFilters, setMenuRecipeStatusFilters] = useState<string[]>([]);
  const [menuRecipeLinkFilters, setMenuRecipeLinkFilters] = useState<string[]>([]);
  const [compareDishSearch, setCompareDishSearch] = useState("");
  const [compareDishClassFilters, setCompareDishClassFilters] = useState<string[]>([]);
  const [compareDishRecipeStatusFilters, setCompareDishRecipeStatusFilters] = useState<string[]>([]);
  const [compareAddOnSearch, setCompareAddOnSearch] = useState("");
  const [compareAddOnClassFilters, setCompareAddOnClassFilters] = useState<string[]>([]);
  const [compareAddOnRecipeStatusFilters, setCompareAddOnRecipeStatusFilters] = useState<string[]>([]);
  const [compareAddOnRecipeLinkFilters, setCompareAddOnRecipeLinkFilters] = useState<string[]>([]);
  const [viewTab, setViewTab] = useState<KitchenViewTab>("menu");
  const [viewTabInitialized, setViewTabInitialized] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/kitchen");
    if (res.status === 401) {
      router.push("/login");
      return;
    }
    if (!res.ok) return;
    setData(await res.json());
    setLoading(false);
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const refresh = () => {
      void load();
    };
    window.addEventListener(NEW_CATALOG_EVENT, refresh);
    return () => window.removeEventListener(NEW_CATALOG_EVENT, refresh);
  }, [load]);

  const kitchen = data ?? {
    restaurant: { name: "Your kitchen", isSeeded: false },
    orderStats: { purchaseOrderCount: 0, salesOrderCount: 0, hasOrders: false },
    ingredients: [] as IngredientRow[],
    menuItems: [] as MenuItemRow[],
  };

  const hasOrders = kitchen.orderStats?.hasOrders ?? false;

  useEffect(() => {
    if (!data || viewTabInitialized) return;
    setViewTab(data.orderStats?.hasOrders ? "both" : "menu");
    setViewTabInitialized(true);
  }, [data, viewTabInitialized]);

  const missingPhotoCount = useMemo(
    () => kitchen.ingredients.filter((item) => ingredientMissingPhotos(item)).length,
    [kitchen.ingredients]
  );

  const dishItems = useMemo(
    () => kitchen.menuItems.filter((item) => item.kind === "dish"),
    [kitchen.menuItems]
  );

  const addOnItems = useMemo(
    () => kitchen.menuItems.filter((item) => item.kind === "addon"),
    [kitchen.menuItems]
  );

  const missingDishPhotoCount = useMemo(
    () => dishItems.filter((item) => item.missingPhotos).length,
    [dishItems]
  );

  const missingAddOnPhotoCount = useMemo(
    () => addOnItems.filter((item) => item.missingPhotos).length,
    [addOnItems]
  );

  function menuItemToDishDetail(item: MenuItemRow): DishDetail {
    return {
      slug: item.slug,
      name: item.name,
      category: item.category,
      classification: item.classification ?? item.category,
      sellPrice: item.sellPrice,
      totalSold: item.totalSold,
      recipeStatus: item.recipeStatus as DishDetail["recipeStatus"],
      description: item.description,
      imageUrl: item.imageUrl,
      imageCandidates: item.imageCandidates ?? [],
      selectedImageIndex: item.selectedImageIndex ?? 0,
      imageGenerationAttempted: item.imageGenerationAttempted ?? false,
      ingredientLinks: item.ingredientLinks ?? [],
      linkedAddOnSlugs: item.linkedAddOnSlugs ?? [],
    };
  }

  function openNewDishModal() {
    setDishModal({
      slug: "",
      name: "",
      category: "sandwich",
      classification: "sandwich",
      sellPrice: 0,
      totalSold: 0,
      ingredientLinks: [],
      linkedAddOnSlugs: [],
      isNew: true,
    });
  }

  function openNewIngredientModal() {
    setIngredientModal({
      slug: "",
      name: "",
      category: "misc",
      currentQty: 0,
      inventoryUnit: "each",
      reorderThreshold: 1,
      isNew: true,
    });
  }

  const selectedDish = useMemo(
    () => dishItems.find((item) => item.slug === selectedDishSlug) ?? null,
    [dishItems, selectedDishSlug]
  );

  const selectedDishIngredientSlugs = useMemo(() => {
    if (!selectedDish) return null;
    return new Set((selectedDish.ingredientLinks ?? []).map((link) => link.ingredientSlug));
  }, [selectedDish]);

  const brandOptions = useMemo(() => {
    const brands = new Set<string>();
    let hasUnbranded = false;
    for (const item of kitchen.ingredients) {
      const brand = item.brandName?.trim();
      if (brand) brands.add(brand);
      else hasUnbranded = true;
    }
    const options = Array.from(brands)
      .sort((a, b) => a.localeCompare(b))
      .map((brand) => ({ value: brand, label: brand }));
    if (hasUnbranded) {
      options.unshift({ value: "__none__", label: "(No brand)" });
    }
    return options;
  }, [kitchen.ingredients]);

  const departmentOptions = useMemo(() => {
    const departments = new Set<string>();
    for (const item of kitchen.ingredients) {
      departments.add(ingredientClassKey(item.category));
    }
    return Array.from(departments)
      .sort((a, b) => ingredientClassLabel(a).localeCompare(ingredientClassLabel(b)))
      .map((departmentKey) => ({
        value: departmentKey,
        label: ingredientClassLabel(departmentKey),
      }));
  }, [kitchen.ingredients]);

  const categoryOptions = useMemo(() => {
    const categories = new Set<string>();
    for (const item of kitchen.ingredients) {
      categories.add(ingredientSubclassKey(item.category));
    }
    return Array.from(categories)
      .sort((a, b) => formatClassificationLabel(a).localeCompare(formatClassificationLabel(b)))
      .map((categoryKey) => ({
        value: categoryKey,
        label: formatClassificationLabel(categoryKey),
      }));
  }, [kitchen.ingredients]);

  const statusOptions = PANTRY_STATUS_OPTIONS;

  const menuClassOptions = useMemo(() => {
    const classes = new Set<string>();
    for (const item of [...dishItems, ...addOnItems]) {
      const raw = (item.classification ?? item.category ?? "").trim();
      if (!raw) continue;
      classes.add(dishClassKey(raw));
    }
    return Array.from(classes)
      .sort((a, b) => dishClassLabel(a).localeCompare(dishClassLabel(b)))
      .map((key) => ({ value: key, label: dishClassLabel(key) }));
  }, [dishItems, addOnItems]);

  const menuRecipeStatusOptions = useMemo(
    () => [
      { value: "new", label: "New" },
      { value: "active", label: "Active" },
      { value: "inactive", label: "Inactive" },
      { value: "suggested", label: "Suggested" },
      { value: "__none__", label: "No recipe" },
    ],
    []
  );

  const menuRecipeLinkOptions = useMemo(
    () => [
      { value: "has_recipe", label: "Has ingredients linked" },
      { value: "no_recipe", label: "No ingredients linked" },
    ],
    []
  );

  type MenuFilterState = {
    search: string;
    classFilters: string[];
    recipeStatusFilters: string[];
    recipeLinkFilters: string[];
  };

  function menuItemMatchesFilterSet(item: MenuItemRow, filters: MenuFilterState): boolean {
    const nameQuery = filters.search.trim().toLowerCase();
    if (nameQuery && !item.name.toLowerCase().includes(nameQuery)) return false;

    if (filters.classFilters.length > 0) {
      const classKey = dishClassKey(item.classification ?? item.category);
      if (!filters.classFilters.includes(classKey)) return false;
    }

    if (filters.recipeStatusFilters.length > 0) {
      const status = item.recipeStatus?.trim() || "__none__";
      const hasLinks = (item.ingredientLinks?.length ?? 0) > 0;
      const effective = hasLinks ? status : "__none__";
      if (!filters.recipeStatusFilters.includes(effective)) return false;
    }

    if (filters.recipeLinkFilters.length > 0) {
      const hasLinks = (item.ingredientLinks?.length ?? 0) > 0;
      const linkValue = hasLinks ? "has_recipe" : "no_recipe";
      if (!filters.recipeLinkFilters.includes(linkValue)) return false;
    }

    return true;
  }

  const menuFilterState: MenuFilterState = useMemo(
    () => ({
      search: menuSearch,
      classFilters: menuClassFilters,
      recipeStatusFilters: menuRecipeStatusFilters,
      recipeLinkFilters: menuRecipeLinkFilters,
    }),
    [menuSearch, menuClassFilters, menuRecipeStatusFilters, menuRecipeLinkFilters]
  );

  const compareDishFilterState: MenuFilterState = useMemo(
    () => ({
      search: compareDishSearch,
      classFilters: compareDishClassFilters,
      recipeStatusFilters: compareDishRecipeStatusFilters,
      recipeLinkFilters: [],
    }),
    [compareDishSearch, compareDishClassFilters, compareDishRecipeStatusFilters]
  );

  const compareAddOnFilterState: MenuFilterState = useMemo(
    () => ({
      search: compareAddOnSearch,
      classFilters: compareAddOnClassFilters,
      recipeStatusFilters: compareAddOnRecipeStatusFilters,
      recipeLinkFilters: compareAddOnRecipeLinkFilters,
    }),
    [
      compareAddOnSearch,
      compareAddOnClassFilters,
      compareAddOnRecipeStatusFilters,
      compareAddOnRecipeLinkFilters,
    ]
  );

  const filteredDishItems = useMemo(
    () => dishItems.filter((item) => menuItemMatchesFilterSet(item, menuFilterState)),
    [dishItems, menuFilterState]
  );

  const filteredAddOnItems = useMemo(
    () => addOnItems.filter((item) => menuItemMatchesFilterSet(item, menuFilterState)),
    [addOnItems, menuFilterState]
  );

  const filteredCompareDishes = useMemo(
    () => dishItems.filter((item) => menuItemMatchesFilterSet(item, compareDishFilterState)),
    [dishItems, compareDishFilterState]
  );

  const filteredCompareAddOns = useMemo(
    () => addOnItems.filter((item) => menuItemMatchesFilterSet(item, compareAddOnFilterState)),
    [addOnItems, compareAddOnFilterState]
  );

  const compareDishClassOptions = useMemo(() => {
    const classes = new Set<string>();
    for (const item of dishItems) {
      const raw = (item.classification ?? item.category ?? "").trim();
      if (!raw) continue;
      classes.add(dishClassKey(raw));
    }
    return Array.from(classes)
      .sort((a, b) => dishClassLabel(a).localeCompare(dishClassLabel(b)))
      .map((key) => ({ value: key, label: dishClassLabel(key) }));
  }, [dishItems]);

  const compareAddOnClassOptions = useMemo(() => {
    const classes = new Set<string>();
    for (const item of addOnItems) {
      const raw = (item.classification ?? item.category ?? "").trim();
      if (!raw) continue;
      classes.add(dishClassKey(raw));
    }
    return Array.from(classes)
      .sort((a, b) => dishClassLabel(a).localeCompare(dishClassLabel(b)))
      .map((key) => ({ value: key, label: dishClassLabel(key) }));
  }, [addOnItems]);

  const menuFiltersActive = Boolean(
    menuSearch.trim() ||
      menuClassFilters.length > 0 ||
      menuRecipeStatusFilters.length > 0 ||
      menuRecipeLinkFilters.length > 0
  );

  function clearMenuFilters() {
    setMenuSearch("");
    setMenuClassFilters([]);
    setMenuRecipeStatusFilters([]);
    setMenuRecipeLinkFilters([]);
  }

  const compareDishFiltersActive = Boolean(
    compareDishSearch.trim() ||
      compareDishClassFilters.length > 0 ||
      compareDishRecipeStatusFilters.length > 0
  );

  const compareAddOnFiltersActive = Boolean(
    compareAddOnSearch.trim() ||
      compareAddOnClassFilters.length > 0 ||
      compareAddOnRecipeStatusFilters.length > 0 ||
      compareAddOnRecipeLinkFilters.length > 0
  );

  function clearCompareDishFilters() {
    setCompareDishSearch("");
    setCompareDishClassFilters([]);
    setCompareDishRecipeStatusFilters([]);
  }

  function clearCompareAddOnFilters() {
    setCompareAddOnSearch("");
    setCompareAddOnClassFilters([]);
    setCompareAddOnRecipeStatusFilters([]);
    setCompareAddOnRecipeLinkFilters([]);
  }

  const filteredIngredients = useMemo(() => {
    const nameQuery = pantrySearch.trim().toLowerCase();
    return kitchen.ingredients.filter((item) => {
      if (
        selectedDishIngredientSlugs &&
        !selectedDishIngredientSlugs.has(item.slug)
      ) {
        return false;
      }
      if (brandFilters.length > 0) {
        const brandValue = item.brandName?.trim() || "__none__";
        if (!brandFilters.includes(brandValue)) return false;
      }
      if (departmentFilters.length > 0) {
        if (!departmentFilters.includes(ingredientClassKey(item.category))) return false;
      }
      if (categoryFilters.length > 0) {
        if (!categoryFilters.includes(ingredientSubclassKey(item.category))) return false;
      }
      if (statusFilters.length > 0) {
        if (!matchesAnyPantryStatus(item, statusFilters as PantryStatus[])) return false;
      }
      if (!nameQuery) return true;
      return item.name.toLowerCase().includes(nameQuery);
    });
  }, [
    kitchen.ingredients,
    pantrySearch,
    brandFilters,
    departmentFilters,
    categoryFilters,
    statusFilters,
    selectedDishIngredientSlugs,
  ]);

  const comparePantryIngredients = useMemo(() => {
    return kitchen.ingredients.filter((item) => {
      if (selectedDishIngredientSlugs && !selectedDishIngredientSlugs.has(item.slug)) {
        return false;
      }
      return true;
    });
  }, [kitchen.ingredients, selectedDishIngredientSlugs]);

  const dishGroups = useMemo(
    () =>
      groupByClassSubclass(
        filteredDishItems,
        (item) => dishClassKey(item.classification ?? item.category),
        (item) => dishSubclassKey(item.classification ?? item.category),
        dishClassLabel,
        formatClassificationLabel
      ),
    [filteredDishItems]
  );

  const addOnGroups = useMemo(() => {
    return groupByClassSubclass(
      filteredAddOnItems,
      (item) => (item.classification ?? item.category ?? "addon").trim().toLowerCase() || "addon",
      (item) => (item.classification ?? item.category ?? "addon").trim().toLowerCase() || "addon",
      formatClassificationLabel,
      formatClassificationLabel
    );
  }, [filteredAddOnItems]);

  const ingredientGroups = useMemo(
    () =>
      groupByClassSubclass(
        filteredIngredients,
        (item) => ingredientClassKey(item.category),
        (item) => ingredientSubclassKey(item.category),
        ingredientClassLabel,
        formatClassificationLabel
      ),
    [filteredIngredients]
  );

  const pantryOptions = useMemo(
    () =>
      kitchen.ingredients.map((item) => ({
        slug: item.slug,
        name: item.name,
        inventoryUnit: item.inventoryUnit,
      })),
    [kitchen.ingredients]
  );

  const addOnOptions = useMemo(
    () =>
      addOnItems.map((item) => ({
        slug: item.slug,
        name: item.name,
        sellPrice: item.sellPrice,
      })),
    [addOnItems]
  );

  const dishClassOptions = useMemo(
    () => {
      const byNormalized = new Map<string, string>();
      for (const item of dishItems) {
        const raw = (item.classification ?? item.category ?? "").trim();
        if (!raw) continue;
        const normalized = raw.toLowerCase();
        if (!byNormalized.has(normalized)) {
          byNormalized.set(normalized, raw);
        }
      }
      return Array.from(byNormalized.values()).sort((a, b) => a.localeCompare(b));
    },
    [dishItems]
  );

  const addOnClassOptions = useMemo(
    () => {
      const byNormalized = new Map<string, string>();
      for (const item of addOnItems) {
        const raw = (item.classification ?? item.category ?? "").trim();
        if (!raw) continue;
        const normalized = raw.toLowerCase();
        if (!byNormalized.has(normalized)) {
          byNormalized.set(normalized, raw);
        }
      }
      return Array.from(byNormalized.values()).sort((a, b) => a.localeCompare(b));
    },
    [addOnItems]
  );

  const pantryFiltersActive = Boolean(
    pantrySearch.trim() ||
      brandFilters.length > 0 ||
      departmentFilters.length > 0 ||
      categoryFilters.length > 0 ||
      statusFilters.length > 0 ||
      selectedDishSlug
  );

  function clearPantryFilters(clearDishSelection = false) {
    setPantrySearch("");
    setBrandFilters([]);
    setDepartmentFilters([]);
    setCategoryFilters([]);
    setStatusFilters([]);
    if (clearDishSelection) {
      setSelectedDishSlug(null);
    }
  }

  async function handleGenerateMissingDishImages() {
    setDishBulkGenerating(true);
    setDishBulkMessage("");
    try {
      const res = await fetch("/api/catalog/dishes/generate-missing-images", { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        setDishBulkMessage(body.error ?? "Could not generate images");
        return;
      }
      const { generated, failed, attempted } = body as {
        generated: number;
        attempted: number;
        failed: number;
      };
      if (attempted === 0) {
        setDishBulkMessage("All dishes already have photos.");
      } else if (failed === 0) {
        setDishBulkMessage(`Generated images for ${generated} dish${generated === 1 ? "" : "es"}.`);
      } else {
        setDishBulkMessage(
          `Generated ${generated} of ${attempted}; ${failed} failed. Try again or use per-dish Generate.`
        );
      }
      await load();
    } catch {
      setDishBulkMessage("Could not generate images. Is the agent running?");
    } finally {
      setDishBulkGenerating(false);
    }
  }

  async function handleGenerateMissingAddOnImages() {
    setAddOnBulkGenerating(true);
    setAddOnBulkMessage("");
    try {
      const res = await fetch("/api/catalog/addons/generate-missing-images", { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        setAddOnBulkMessage(body.error ?? "Could not generate images");
        return;
      }
      const { generated, failed, attempted } = body as {
        generated: number;
        attempted: number;
        failed: number;
      };
      if (attempted === 0) {
        setAddOnBulkMessage("All add-ons already have photos.");
      } else if (failed === 0) {
        setAddOnBulkMessage(`Generated images for ${generated} add-on${generated === 1 ? "" : "s"}.`);
      } else {
        setAddOnBulkMessage(
          `Generated ${generated} of ${attempted}; ${failed} failed. Try again or use per add-on Generate.`
        );
      }
      await load();
    } catch {
      setAddOnBulkMessage("Could not generate images. Is the agent running?");
    } finally {
      setAddOnBulkGenerating(false);
    }
  }

  async function handleGenerateMissingImages() {
    setBulkGenerating(true);
    setBulkMessage("");
    try {
      const res = await fetch("/api/catalog/ingredients/generate-missing-images", {
        method: "POST",
      });
      const body = await res.json();
      if (!res.ok) {
        setBulkMessage(body.error ?? "Could not generate images");
        return;
      }
      const { generated, failed, attempted } = body as {
        generated: number;
        attempted: number;
        failed: number;
      };
      if (attempted === 0) {
        setBulkMessage("All pantry items already have photos.");
      } else if (failed === 0) {
        setBulkMessage(`Generated images for ${generated} ingredient${generated === 1 ? "" : "s"}.`);
      } else {
        setBulkMessage(
          `Generated ${generated} of ${attempted}; ${failed} failed. Try again or use per-item Generate.`
        );
      }
      await load();
    } catch {
      setBulkMessage("Could not generate images. Is the agent running?");
    } finally {
      setBulkGenerating(false);
    }
  }

  if (loading && !data && review.sessionLoading) {
    return (
      <>
        <Nav />
        <p className="p-8 text-chef-text-muted">Loading your kitchen…</p>
      </>
    );
  }

  const empty =
    kitchen.ingredients.length === 0 &&
    kitchen.menuItems.length === 0 &&
    review.newIngredients.length === 0 &&
    review.newDishes.length === 0;

  function menuSalesForItem(item: MenuItemRow) {
    return {
      sellPrice: item.sellPrice,
      totalSold: item.totalSold,
      soldThisWeek: item.soldThisWeek,
    };
  }

  function ingredientPantryForItem(item: IngredientRow) {
    return {
      lastPurchasePrice: item.lastPurchasePrice,
      currentQty: item.currentQty,
      inventoryUnit: item.inventoryUnit,
      reorderThreshold: item.reorderThreshold,
    };
  }

  const KITCHEN_TABS: { id: KitchenViewTab; label: string }[] = [
    { id: "menu", label: "Menu" },
    { id: "pantry", label: "Pantry" },
    { id: "both", label: "Compare View" },
  ];

  const newItemsReviewSection =
    !review.sessionLoading &&
    (review.newIngredients.length > 0 || review.newDishes.length > 0) ? (
      <section className="mt-6">
        <NewItemsReview
          newIngredients={review.newIngredients}
          newDishes={review.newDishes}
          missingIngredients={[]}
          onIngredientAdded={(id, billId) => {
            review.handleIngredientAdded(id, billId);
            void load();
          }}
          onDishAdded={(id, billId) => {
            review.handleDishAdded(id, billId);
            void load();
          }}
          onMissingIngredientAdded={() => {}}
          onIngredientsChange={review.updateIngredients}
          onDishesChange={review.updateDishes}
          onMissingIngredientsChange={() => {}}
          onBillsProcessed={review.handleBillsProcessed}
          onItemsAdded={(ids) => {
            review.markItemsAdded(ids);
            void load();
          }}
        />
      </section>
    ) : null;

  const enrichingPanel =
    !review.sessionLoading && (review.preparingReview || review.pendingCount > 0) ? (
      <NewItemsEnrichingPanel
        readyCount={review.readyIngredients.length}
        totalCount={review.newIngredients.length}
        statusLabel={review.prepareLabel}
      />
    ) : null;

  const uploadHint =
    kitchen.menuItems.length > 0 ? (
      <p className="text-sm text-chef-text-muted">
        Need more stock?{" "}
        <Link href="/upload-orders" className="text-chef-sage underline">
          Upload purchase orders
        </Link>{" "}
        and click Process.
      </p>
    ) : null;

  return (
    <>
      <Nav />
      <main className="sc-main-with-nav sc-main-with-floating-agent sc-page-shell pb-8">
        <div>
          <h1 className="text-2xl font-semibold text-chef-text sm:text-3xl">Kitchen control</h1>
          <p className="mt-2 text-base text-chef-text-muted">
            Manage Dishes in Menu and Ingredients in Pantry, and View Dishes, Ingredients and Dish{" "}
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap align-middle">
              <span aria-hidden="true">&lt;</span>
              <span className="inline-block w-8 border-t border-dotted border-chef-text-muted/70" />
              <span>Linked_to</span>
              <span className="inline-block w-8 border-t border-dotted border-chef-text-muted/70" />
            </span>{" "}
            Ingredients
          </p>
        </div>

        {!hasOrders && empty && (
          <div className="mt-6 rounded-xl border border-chef-amber/30 bg-chef-amber-light/40 p-4 sm:p-5">
            <p className="text-sm leading-relaxed text-chef-text-muted">
              No purchase or sales orders uploaded yet. Use the tabs below to build your menu and
              pantry manually, or{" "}
              <Link href="/upload-orders" className="font-medium text-chef-sage underline">
                upload orders
              </Link>{" "}
              to populate from bills.
            </p>
          </div>
        )}

        <div
          className="mt-6 flex flex-wrap gap-2 border-b border-chef-border pb-3"
          role="tablist"
          aria-label="Kitchen views"
        >
          {KITCHEN_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={viewTab === tab.id}
              onClick={() => setViewTab(tab.id)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                viewTab === tab.id
                  ? "bg-chef-sage text-white"
                  : "bg-chef-muted text-chef-text-muted hover:text-chef-text"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {viewTab === "menu" && (
          <div className="mt-6 space-y-6">
            <MenuFiltersBar
              totalCount={dishItems.length + addOnItems.length}
              filteredCount={filteredDishItems.length + filteredAddOnItems.length}
              menuSearch={menuSearch}
              onMenuSearchChange={setMenuSearch}
              classFilters={menuClassFilters}
              onClassFiltersChange={setMenuClassFilters}
              classOptions={menuClassOptions}
              recipeStatusFilters={menuRecipeStatusFilters}
              onRecipeStatusFiltersChange={setMenuRecipeStatusFilters}
              recipeStatusOptions={menuRecipeStatusOptions}
              recipeLinkFilters={menuRecipeLinkFilters}
              onRecipeLinkFiltersChange={setMenuRecipeLinkFilters}
              recipeLinkOptions={menuRecipeLinkOptions}
              filtersActive={menuFiltersActive}
              onClearFilters={clearMenuFilters}
            />
            <section className="rounded-2xl border border-chef-border bg-chef-surface/50 p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-chef-text">Dishes</h2>
                  <p className="mt-1 text-sm text-chef-text-muted">
                    Grouped by class and subclass. Double-click a dish to edit.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={openNewDishModal}
                    className="shrink-0 rounded-lg bg-chef-sage px-3 py-1.5 text-sm font-medium text-white hover:bg-chef-sage/90"
                  >
                    + Dish
                  </button>
                  {missingDishPhotoCount > 0 && (
                    <button
                      type="button"
                      disabled={dishBulkGenerating}
                      onClick={() => void handleGenerateMissingDishImages()}
                      className="shrink-0 rounded-lg border border-chef-sage/50 px-3 py-1.5 text-sm font-medium text-chef-sage hover:bg-chef-sage-light/40 disabled:opacity-50"
                    >
                      {dishBulkGenerating
                        ? "Generating…"
                        : `Generate images for missing (${missingDishPhotoCount})`}
                    </button>
                  )}
                </div>
              </div>

              {dishBulkMessage && (
                <p className="mt-3 text-sm text-chef-text-muted">{dishBulkMessage}</p>
              )}

              <div className={`mt-4 ${KITCHEN_CARD_TWO_ROW_SCROLL_CLASS}`}>
                <KitchenClassifiedGrid
                  groups={dishGroups}
                  emptyMessage="No dishes yet. Add one manually or process sales orders."
                  itemLabel={(count) => `${count} dish${count === 1 ? "" : "es"}`}
                  renderItem={(item) => (
                    <KitchenCard
                      name={item.name}
                      imageUrl={item.imageUrl}
                      menuSales={menuSalesForItem(item)}
                      selected={selectedDishSlug === item.slug}
                      onClick={() => {
                        setSelectedDishSlug((prev) => (prev === item.slug ? null : item.slug));
                      }}
                      onDoubleClick={() => setDishModal(menuItemToDishDetail(item))}
                    />
                  )}
                />
              </div>
            </section>

            <section className="rounded-2xl border border-chef-border bg-chef-surface/50 p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-chef-text">Add-ons</h2>
                  <p className="mt-1 text-sm text-chef-text-muted">
                    Grouped by the class and subclass of linked dishes.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setAddOnModal({
                        slug: "",
                        name: "",
                        classification: addOnClassOptions[0] ?? "addon",
                        description: "",
                        sellPrice: 0,
                        ingredientLinks: [],
                        linkedDishSlugs: [],
                        isNew: true,
                      })
                    }
                    className="shrink-0 rounded-lg bg-chef-sage px-3 py-1.5 text-sm font-medium text-white hover:bg-chef-sage/90"
                  >
                    + Add-on
                  </button>
                  {missingAddOnPhotoCount > 0 && (
                    <button
                      type="button"
                      disabled={addOnBulkGenerating}
                      onClick={() => void handleGenerateMissingAddOnImages()}
                      className="shrink-0 rounded-lg border border-chef-sage/50 px-3 py-1.5 text-sm font-medium text-chef-sage hover:bg-chef-sage-light/40 disabled:opacity-50"
                    >
                      {addOnBulkGenerating
                        ? "Generating…"
                        : `Generate images for missing (${missingAddOnPhotoCount})`}
                    </button>
                  )}
                </div>
              </div>
              {addOnBulkMessage && (
                <p className="mt-3 text-sm text-chef-text-muted">{addOnBulkMessage}</p>
              )}
              <div className={`mt-4 ${KITCHEN_CARD_TWO_ROW_SCROLL_CLASS}`}>
                <KitchenClassifiedGrid
                  groups={addOnGroups}
                  emptyMessage="No add-ons yet. Process sales orders to capture add-ons."
                  itemLabel={(count) => `${count} add-on${count === 1 ? "" : "s"}`}
                  renderItem={(item) => (
                    <KitchenCard
                      name={item.name}
                      imageUrl={item.imageUrl}
                      menuSales={menuSalesForItem(item)}
                      onClick={() => {}}
                      onDoubleClick={() =>
                        setAddOnModal({
                          slug: item.slug,
                          name: item.name,
                          classification: item.classification ?? item.category,
                          description: item.description,
                          sellPrice: item.sellPrice,
                          imageUrl: item.imageUrl,
                          imageCandidates: item.imageCandidates ?? [],
                          selectedImageIndex: item.selectedImageIndex ?? 0,
                          imageGenerationAttempted: item.imageGenerationAttempted ?? false,
                          ingredientLinks: item.ingredientLinks ?? [],
                          linkedDishSlugs: item.linkedDishSlugs ?? [],
                        })
                      }
                    />
                  )}
                />
              </div>
            </section>

            {enrichingPanel}
            {newItemsReviewSection}
            {uploadHint && <div className="mt-2">{uploadHint}</div>}
          </div>
        )}

        {viewTab === "pantry" && (
          <div className="mt-6 space-y-6">
            {kitchen.ingredients.length > 0 && (
              <PantryFiltersBar
                totalCount={kitchen.ingredients.length}
                filteredCount={filteredIngredients.length}
                pantrySearch={pantrySearch}
                onPantrySearchChange={setPantrySearch}
                brandFilters={brandFilters}
                onBrandFiltersChange={setBrandFilters}
                brandOptions={brandOptions}
                departmentFilters={departmentFilters}
                onDepartmentFiltersChange={setDepartmentFilters}
                departmentOptions={departmentOptions}
                categoryFilters={categoryFilters}
                onCategoryFiltersChange={setCategoryFilters}
                categoryOptions={categoryOptions}
                statusFilters={statusFilters}
                onStatusFiltersChange={setStatusFilters}
                statusOptions={statusOptions}
                filtersActive={pantryFiltersActive}
                onClearFilters={() => clearPantryFilters()}
              />
            )}
            <section className="rounded-2xl border border-chef-border bg-chef-surface/50 p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-chef-text">Pantry</h2>
                  <p className="mt-1 text-sm text-chef-text-muted">
                    Ingredients grouped by department and category. Tap an item for details.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={openNewIngredientModal}
                    className="shrink-0 rounded-lg bg-chef-sage px-3 py-1.5 text-sm font-medium text-white hover:bg-chef-sage/90"
                  >
                    + Ingredient
                  </button>
                  {missingPhotoCount > 0 && (
                    <button
                      type="button"
                      disabled={bulkGenerating}
                      onClick={() => void handleGenerateMissingImages()}
                      className="shrink-0 rounded-lg border border-chef-sage/50 px-3 py-1.5 text-sm font-medium text-chef-sage hover:bg-chef-sage-light/40 disabled:opacity-50"
                    >
                      {bulkGenerating
                        ? "Generating…"
                        : `Generate images for missing (${missingPhotoCount})`}
                    </button>
                  )}
                </div>
              </div>

              {bulkMessage && <p className="mt-3 text-sm text-chef-text-muted">{bulkMessage}</p>}

              <div className={`mt-4 ${KITCHEN_CARD_TWO_ROW_SCROLL_CLASS}`}>
                {kitchen.ingredients.length === 0 ? (
                  <p className="text-sm text-chef-text-muted">
                    No pantry items yet. Add an ingredient or process a purchase order.
                  </p>
                ) : filteredIngredients.length === 0 ? (
                  <p className="text-sm text-chef-text-muted">
                    No ingredients match your search or filters.
                  </p>
                ) : (
                  <KitchenClassifiedGrid
                    groups={ingredientGroups}
                    emptyMessage="No ingredients match your search or filters."
                    subgroupTitlePrefix="Category"
                    renderItem={(item) => (
                      <KitchenCard
                        name={item.name}
                        imageUrl={item.imageUrl}
                        ingredientPantry={ingredientPantryForItem(item)}
                        label={item.label}
                        onClick={() => setIngredientModal(item)}
                      />
                    )}
                  />
                )}
              </div>
            </section>
            {uploadHint && <div className="mt-6">{uploadHint}</div>}
          </div>
        )}

        {viewTab === "both" && (
          <div className="mt-6 lg:grid lg:grid-cols-2 lg:items-start lg:gap-8">
            <div className="min-w-0 space-y-6">
              <section className="rounded-2xl border border-chef-border bg-chef-surface/50 p-4 sm:p-5">
                <div>
                  <h2 className="text-lg font-semibold text-chef-text">Dishes</h2>
                  <p className="mt-1 text-sm text-chef-text-muted">
                    Click a dish to filter pantry ingredients; double-click to edit.
                  </p>
                </div>

                <MenuFiltersBar
                  totalCount={dishItems.length}
                  filteredCount={filteredCompareDishes.length}
                  menuSearch={compareDishSearch}
                  onMenuSearchChange={setCompareDishSearch}
                  classFilters={compareDishClassFilters}
                  onClassFiltersChange={setCompareDishClassFilters}
                  classOptions={compareDishClassOptions}
                  recipeStatusFilters={compareDishRecipeStatusFilters}
                  onRecipeStatusFiltersChange={setCompareDishRecipeStatusFilters}
                  recipeStatusOptions={menuRecipeStatusOptions}
                  recipeLinkFilters={[]}
                  onRecipeLinkFiltersChange={() => {}}
                  recipeLinkOptions={menuRecipeLinkOptions}
                  showRecipeLinkFilter={false}
                  filtersActive={compareDishFiltersActive}
                  onClearFilters={clearCompareDishFilters}
                />

                <div className={`mt-3 flex flex-wrap gap-3 ${KITCHEN_CARD_TWO_ROW_SCROLL_CLASS}`}>
                  {dishItems.length === 0 ? (
                    <p className="text-sm text-chef-text-muted">
                      No dishes yet. Add one manually or process sales orders.
                    </p>
                  ) : filteredCompareDishes.length === 0 ? (
                    <p className="text-sm text-chef-text-muted">No dishes match your filters.</p>
                  ) : (
                    filteredCompareDishes.map((item) => (
                      <KitchenCard
                        key={`${item.kind}:${item.slug}`}
                        name={item.name}
                        imageUrl={item.imageUrl}
                        menuSales={menuSalesForItem(item)}
                        selected={selectedDishSlug === item.slug}
                        onClick={() => {
                          setSelectedDishSlug((prev) =>
                            prev === item.slug ? null : item.slug
                          );
                        }}
                        onDoubleClick={() => setDishModal(menuItemToDishDetail(item))}
                      />
                    ))
                  )}
                </div>
                <p className="mt-2 text-xs text-chef-text-muted">
                  {filteredCompareDishes.length} of {dishItems.length} dish
                  {dishItems.length === 1 ? "" : "es"}
                </p>
              </section>

              <section className="rounded-2xl border border-chef-border bg-chef-surface/50 p-4 sm:p-5">
                <div>
                  <h2 className="text-lg font-semibold text-chef-text">Add-ons</h2>
                  <p className="mt-1 text-sm text-chef-text-muted">
                    POS modifiers from processed sales orders. Double-click to edit.
                  </p>
                </div>

                <MenuFiltersBar
                  totalCount={addOnItems.length}
                  filteredCount={filteredCompareAddOns.length}
                  menuSearch={compareAddOnSearch}
                  onMenuSearchChange={setCompareAddOnSearch}
                  classFilters={compareAddOnClassFilters}
                  onClassFiltersChange={setCompareAddOnClassFilters}
                  classOptions={compareAddOnClassOptions}
                  recipeStatusFilters={compareAddOnRecipeStatusFilters}
                  onRecipeStatusFiltersChange={setCompareAddOnRecipeStatusFilters}
                  recipeStatusOptions={menuRecipeStatusOptions}
                  recipeLinkFilters={compareAddOnRecipeLinkFilters}
                  onRecipeLinkFiltersChange={setCompareAddOnRecipeLinkFilters}
                  recipeLinkOptions={menuRecipeLinkOptions}
                  filtersActive={compareAddOnFiltersActive}
                  onClearFilters={clearCompareAddOnFilters}
                />

                <div className={`mt-3 flex flex-wrap gap-3 ${KITCHEN_CARD_TWO_ROW_SCROLL_CLASS}`}>
                  {addOnItems.length === 0 ? (
                    <p className="text-sm text-chef-text-muted">
                      No add-ons yet. Process sales orders to capture add-ons.
                    </p>
                  ) : filteredCompareAddOns.length === 0 ? (
                    <p className="text-sm text-chef-text-muted">No add-ons match your filters.</p>
                  ) : (
                    filteredCompareAddOns.map((item) => (
                      <KitchenCard
                        key={`${item.kind}:${item.slug}`}
                        name={item.name}
                        imageUrl={item.imageUrl}
                        menuSales={menuSalesForItem(item)}
                        onClick={() => {}}
                        onDoubleClick={() =>
                          setAddOnModal({
                            slug: item.slug,
                            name: item.name,
                            classification: item.classification ?? item.category,
                            description: item.description,
                            sellPrice: item.sellPrice,
                            imageUrl: item.imageUrl,
                            imageCandidates: item.imageCandidates ?? [],
                            selectedImageIndex: item.selectedImageIndex ?? 0,
                            imageGenerationAttempted: item.imageGenerationAttempted ?? false,
                            ingredientLinks: item.ingredientLinks ?? [],
                            linkedDishSlugs: item.linkedDishSlugs ?? [],
                          })
                        }
                      />
                    ))
                  )}
                </div>
                <p className="mt-2 text-xs text-chef-text-muted">
                  {filteredCompareAddOns.length} of {addOnItems.length} add-on
                  {addOnItems.length === 1 ? "" : "s"}
                </p>
              </section>

              {enrichingPanel}
              {newItemsReviewSection}

              {uploadHint}
            </div>

            <aside className="mt-8 min-w-0 lg:mt-0 lg:sticky lg:top-6">
              <section className="rounded-2xl border border-chef-border bg-chef-surface/50 p-4 sm:p-5">
                <div>
                  <h2 className="text-lg font-semibold text-chef-text">Pantry</h2>
                  <p className="mt-1 text-sm text-chef-text-muted">
                    {selectedDish
                      ? `Showing ingredients linked to ${selectedDish.name}. Tap the dish again to show all.`
                      : "Stock from processed orders. Tap an item for details."}
                  </p>
                </div>

                {kitchen.ingredients.length === 0 ? (
                  <p className="mt-4 text-sm text-chef-text-muted">
                    No pantry items yet. Process a purchase order to add stock.
                  </p>
                ) : comparePantryIngredients.length === 0 ? (
                  <p className="mt-4 text-sm text-chef-text-muted">
                    {selectedDish
                      ? `No linked ingredients for ${selectedDish.name} yet. Double-click the dish to add some.`
                      : "No pantry items to show."}
                  </p>
                ) : (
                  <div className={`mt-3 flex flex-wrap gap-3 ${KITCHEN_CARD_TWO_ROW_SCROLL_CLASS}`}>
                    {comparePantryIngredients.map((item) => (
                      <KitchenCard
                        key={`${item.slug}:${item.imageUrl ?? ""}:${item.selectedImageIndex ?? 0}`}
                        name={item.name}
                        imageUrl={item.imageUrl}
                        ingredientPantry={ingredientPantryForItem(item)}
                        label={item.label}
                        onClick={() => setIngredientModal(item)}
                      />
                    ))}
                  </div>
                )}
              </section>
            </aside>
          </div>
        )}
      </main>

      {dishModal && (
        <KitchenDishModal
          item={dishModal}
          pantryIngredients={pantryOptions}
          existingAddOns={addOnOptions}
          classOptions={dishClassOptions}
          onClose={() => setDishModal(null)}
          onSaved={(updated) => {
            const wasNew = dishModal.isNew;
            setData((prev) => {
              if (!prev) return prev;
              if (wasNew) {
                return {
                  ...prev,
                  menuItems: [
                    ...prev.menuItems,
                    {
                      kind: "dish" as const,
                      slug: updated.slug,
                      name: updated.name,
                      sellPrice: updated.sellPrice,
                      totalSold: updated.totalSold,
                      soldThisWeek: 0,
                      recipeStatus: updated.recipeStatus ?? "new",
                      category: updated.classification ?? updated.category,
                      classification: updated.classification ?? updated.category,
                      description: updated.description,
                      imageUrl: updated.imageUrl,
                      imageCandidates: updated.imageCandidates,
                      selectedImageIndex: updated.selectedImageIndex,
                      imageGenerationAttempted: updated.imageGenerationAttempted,
                      missingPhotos: dishMissingPhotos(updated),
                      ingredientLinks: updated.ingredientLinks ?? [],
                      linkedAddOnSlugs: updated.linkedAddOnSlugs ?? [],
                    },
                  ].sort((a, b) => a.name.localeCompare(b.name)),
                };
              }
              return {
                ...prev,
                menuItems: prev.menuItems.map((row) =>
                  row.kind === "dish" && row.slug === updated.slug
                    ? {
                        ...row,
                        name: updated.name,
                        category: updated.classification ?? updated.category,
                        classification: updated.classification ?? updated.category,
                        sellPrice: updated.sellPrice,
                        description: updated.description,
                        imageUrl: updated.imageUrl,
                        imageCandidates: updated.imageCandidates,
                        selectedImageIndex: updated.selectedImageIndex,
                        imageGenerationAttempted: updated.imageGenerationAttempted,
                        missingPhotos: dishMissingPhotos(updated),
                        ingredientLinks: updated.ingredientLinks ?? [],
                        linkedAddOnSlugs: updated.linkedAddOnSlugs ?? [],
                      }
                    : row
                ),
              };
            });
            if (wasNew || dishModal.slug === updated.slug) {
              setDishModal({ ...updated, isNew: false });
            }
            if (selectedDishSlug === dishModal.slug || wasNew) {
              setSelectedDishSlug(updated.slug);
            }
            void load();
          }}
          onDeleted={(slug) => {
            setData((prev) =>
              prev
                ? {
                    ...prev,
                    menuItems: prev.menuItems.filter(
                      (row) => !(row.kind === "dish" && row.slug === slug)
                    ),
                  }
                : prev
            );
            setSelectedDishSlug((prev) => (prev === slug ? null : prev));
            void load();
          }}
        />
      )}

      {addOnModal && (
        <KitchenAddOnModal
          item={addOnModal}
          pantryIngredients={pantryOptions}
          classOptions={addOnClassOptions}
          onClose={() => setAddOnModal(null)}
          onSaved={(addOn) => {
            const wasNew = addOnModal.isNew || !addOnModal.slug;
            setData((prev) => {
              if (!prev) return prev;
              if (wasNew) {
                return {
                  ...prev,
                  menuItems: [
                    ...prev.menuItems,
                    {
                      kind: "addon" as const,
                      slug: addOn.slug,
                      name: addOn.name,
                      sellPrice: addOn.sellPrice,
                      totalSold: 0,
                      soldThisWeek: 0,
                      recipeStatus: "new",
                      category: addOn.classification ?? "addon",
                      classification: addOn.classification ?? "addon",
                      description: addOn.description,
                      imageUrl: addOn.imageUrl,
                      imageCandidates: addOn.imageCandidates,
                      selectedImageIndex: addOn.selectedImageIndex,
                      imageGenerationAttempted: addOn.imageGenerationAttempted,
                      missingPhotos: dishMissingPhotos(addOn),
                      ingredientLinks: addOn.ingredientLinks ?? [],
                      linkedDishSlugs: addOn.linkedDishSlugs ?? [],
                    },
                  ].sort((a, b) => a.name.localeCompare(b.name)),
                };
              }
              return {
                ...prev,
                menuItems: prev.menuItems.map((row) =>
                  row.kind === "addon" && row.slug === addOn.slug
                    ? {
                        ...row,
                        name: addOn.name,
                        sellPrice: addOn.sellPrice,
                        category: addOn.classification ?? "addon",
                        classification: addOn.classification ?? "addon",
                        description: addOn.description,
                        imageUrl: addOn.imageUrl,
                        imageCandidates: addOn.imageCandidates,
                        selectedImageIndex: addOn.selectedImageIndex,
                        imageGenerationAttempted: addOn.imageGenerationAttempted,
                        missingPhotos: dishMissingPhotos(addOn),
                        ingredientLinks: addOn.ingredientLinks ?? [],
                        linkedDishSlugs: addOn.linkedDishSlugs ?? [],
                      }
                    : row
                ),
              };
            });
            if (wasNew || addOnModal.slug === addOn.slug) {
              setAddOnModal({
                slug: addOn.slug,
                name: addOn.name,
                classification: addOn.classification,
                description: addOn.description,
                sellPrice: addOn.sellPrice,
                imageUrl: addOn.imageUrl,
                imageCandidates: addOn.imageCandidates,
                selectedImageIndex: addOn.selectedImageIndex,
                imageGenerationAttempted: addOn.imageGenerationAttempted,
                ingredientLinks: addOn.ingredientLinks ?? [],
                linkedDishSlugs: addOn.linkedDishSlugs ?? [],
                isNew: false,
              });
            }
            void load();
          }}
          onDeleted={(slug) => {
            setData((prev) =>
              prev
                ? {
                    ...prev,
                    menuItems: prev.menuItems.filter(
                      (row) => !(row.kind === "addon" && row.slug === slug)
                    ),
                  }
                : prev
            );
            void load();
          }}
        />
      )}

      {ingredientModal && (
        <KitchenIngredientModal
          item={ingredientModal}
          onClose={() => setIngredientModal(null)}
          onSaved={(updated) => {
            const wasNew = ingredientModal.isNew || !ingredientModal.slug;
            setData((prev) => {
              if (!prev) return prev;
              if (wasNew) {
                return {
                  ...prev,
                  ingredients: [
                    ...prev.ingredients,
                    {
                      ...updated,
                      category: updated.category ?? "misc",
                    } as IngredientRow,
                  ].sort((a, b) => a.name.localeCompare(b.name)),
                };
              }
              return {
                ...prev,
                ingredients: prev.ingredients.map((row) =>
                  row.slug === updated.slug ? { ...row, ...updated } : row
                ),
              };
            });
            if (wasNew || ingredientModal.slug === updated.slug) {
              setIngredientModal({
                ...updated,
                category: updated.category ?? "misc",
                isNew: false,
              });
            }
            void load();
          }}
          onDeleted={(slug) => {
            setData((prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                ingredients: prev.ingredients.filter((row) => row.slug !== slug),
              };
            });
            setIngredientModal(null);
            void load();
          }}
        />
      )}
      <SousChefChatDock />
    </>
  );
}
