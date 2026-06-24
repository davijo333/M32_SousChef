"use client";

import {
  PantryMultiSelectFilter,
  type MultiSelectOption,
} from "@/components/PantryMultiSelectFilter";

type MenuFiltersBarProps = {
  totalCount: number;
  filteredCount: number;
  menuSearch: string;
  onMenuSearchChange: (value: string) => void;
  classFilters: string[];
  onClassFiltersChange: (value: string[]) => void;
  classOptions: MultiSelectOption[];
  recipeStatusFilters: string[];
  onRecipeStatusFiltersChange: (value: string[]) => void;
  recipeStatusOptions: MultiSelectOption[];
  recipeLinkFilters: string[];
  onRecipeLinkFiltersChange: (value: string[]) => void;
  recipeLinkOptions: MultiSelectOption[];
  filtersActive: boolean;
  onClearFilters: () => void;
};

export function MenuFiltersBar({
  totalCount,
  filteredCount,
  menuSearch,
  onMenuSearchChange,
  classFilters,
  onClassFiltersChange,
  classOptions,
  recipeStatusFilters,
  onRecipeStatusFiltersChange,
  recipeStatusOptions,
  recipeLinkFilters,
  onRecipeLinkFiltersChange,
  recipeLinkOptions,
  filtersActive,
  onClearFilters,
}: MenuFiltersBarProps) {
  return (
    <div className="mt-4 space-y-2">
      <div className="flex flex-col gap-2 lg:flex-row lg:flex-wrap">
        <label className="block flex-1 text-sm lg:min-w-[12rem]">
          <span className="sr-only">Search dish or add-on name</span>
          <input
            type="search"
            value={menuSearch}
            onChange={(event) => onMenuSearchChange(event.target.value)}
            placeholder="Search dish or add-on…"
            className="w-full rounded-lg border border-chef-muted bg-white px-3 py-2 text-sm text-chef-text placeholder:text-chef-text-muted/70"
          />
        </label>
        <PantryMultiSelectFilter
          label="Filter by class"
          placeholder="All classes"
          options={classOptions}
          selected={classFilters}
          onChange={onClassFiltersChange}
          className="w-full text-sm sm:w-44"
        />
        <PantryMultiSelectFilter
          label="Filter by recipe status"
          placeholder="All statuses"
          options={recipeStatusOptions}
          selected={recipeStatusFilters}
          onChange={onRecipeStatusFiltersChange}
          className="w-full text-sm sm:w-44"
        />
        <PantryMultiSelectFilter
          label="Filter by recipe"
          placeholder="Recipe link"
          options={recipeLinkOptions}
          selected={recipeLinkFilters}
          onChange={onRecipeLinkFiltersChange}
          className="w-full text-sm sm:w-44"
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-chef-text-muted">
        <span>
          {filteredCount} of {totalCount} items
        </span>
        {filtersActive && (
          <button
            type="button"
            onClick={onClearFilters}
            className="font-medium text-chef-sage hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}
