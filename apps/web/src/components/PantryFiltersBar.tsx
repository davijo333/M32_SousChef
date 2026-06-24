"use client";

import {
  PantryMultiSelectFilter,
  type MultiSelectOption,
} from "@/components/PantryMultiSelectFilter";

type PantryFiltersBarProps = {
  totalCount: number;
  filteredCount: number;
  pantrySearch: string;
  onPantrySearchChange: (value: string) => void;
  brandFilters: string[];
  onBrandFiltersChange: (value: string[]) => void;
  brandOptions: MultiSelectOption[];
  departmentFilters: string[];
  onDepartmentFiltersChange: (value: string[]) => void;
  departmentOptions: MultiSelectOption[];
  categoryFilters: string[];
  onCategoryFiltersChange: (value: string[]) => void;
  categoryOptions: MultiSelectOption[];
  statusFilters: string[];
  onStatusFiltersChange: (value: string[]) => void;
  statusOptions: MultiSelectOption[];
  filtersActive: boolean;
  onClearFilters: () => void;
};

export function PantryFiltersBar({
  totalCount,
  filteredCount,
  pantrySearch,
  onPantrySearchChange,
  brandFilters,
  onBrandFiltersChange,
  brandOptions,
  departmentFilters,
  onDepartmentFiltersChange,
  departmentOptions,
  categoryFilters,
  onCategoryFiltersChange,
  categoryOptions,
  statusFilters,
  onStatusFiltersChange,
  statusOptions,
  filtersActive,
  onClearFilters,
}: PantryFiltersBarProps) {
  return (
    <div className="mt-4 space-y-2">
      <div className="flex flex-col gap-2 lg:flex-row lg:flex-wrap">
        <label className="block flex-1 text-sm lg:min-w-[12rem]">
          <span className="sr-only">Search ingredient name</span>
          <input
            type="search"
            value={pantrySearch}
            onChange={(event) => onPantrySearchChange(event.target.value)}
            placeholder="Search ingredient name…"
            className="w-full rounded-lg border border-chef-muted bg-white px-3 py-2 text-sm text-chef-text placeholder:text-chef-text-muted/70"
          />
        </label>
        <PantryMultiSelectFilter
          label="Filter by brand"
          placeholder="All brands"
          options={brandOptions}
          selected={brandFilters}
          onChange={onBrandFiltersChange}
          className="w-full text-sm sm:w-44"
        />
        <PantryMultiSelectFilter
          label="Filter by department"
          placeholder="All departments"
          options={departmentOptions}
          selected={departmentFilters}
          onChange={onDepartmentFiltersChange}
          className="w-full text-sm sm:w-44"
        />
        <PantryMultiSelectFilter
          label="Filter by category"
          placeholder="All categories"
          options={categoryOptions}
          selected={categoryFilters}
          onChange={onCategoryFiltersChange}
          className="w-full text-sm sm:w-44"
        />
        <PantryMultiSelectFilter
          label="Filter by status"
          placeholder="Status"
          options={statusOptions}
          selected={statusFilters}
          onChange={onStatusFiltersChange}
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
