/** Fired after chat or UI persists menu/pantry changes — pages refetch kitchen/recipes. */
export const CATALOG_UPDATED_EVENT = "souschef:catalog-updated";

export function dispatchCatalogUpdated() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(CATALOG_UPDATED_EVENT));
  }
}
