"use client";

import { useEffect, useRef, useState } from "react";

export type MultiSelectOption = {
  value: string;
  label: string;
};

type PantryMultiSelectFilterProps = {
  label: string;
  placeholder: string;
  options: MultiSelectOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  className?: string;
};

export function PantryMultiSelectFilter({
  label,
  placeholder,
  options,
  selected,
  onChange,
  className = "",
}: PantryMultiSelectFilterProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const summary =
    selected.length === 0
      ? placeholder
      : selected.length === 1
        ? (options.find((option) => option.value === selected[0])?.label ?? selected[0])
        : `${selected.length} selected`;

  function toggle(value: string) {
    onChange(
      selected.includes(value)
        ? selected.filter((entry) => entry !== value)
        : [...selected, value]
    );
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <span className="sr-only">{label}</span>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-chef-muted bg-white px-3 py-2 text-sm text-chef-text"
      >
        <span className={selected.length === 0 ? "text-chef-text-muted/70" : ""}>{summary}</span>
        <span className="text-chef-text-muted" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <div
          role="listbox"
          aria-label={label}
          className="absolute z-20 mt-1 max-h-56 w-full min-w-[10rem] overflow-y-auto rounded-lg border border-chef-muted bg-white py-1 shadow-lg"
        >
          {options.length === 0 ? (
            <p className="px-3 py-2 text-sm text-chef-text-muted">No options</p>
          ) : (
            options.map((option) => (
              <label
                key={option.value}
                className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-chef-sage-light/30"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(option.value)}
                  onChange={() => toggle(option.value)}
                  className="rounded border-chef-muted text-chef-sage"
                />
                <span className="text-chef-text">{option.label}</span>
              </label>
            ))
          )}
          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="mt-1 w-full border-t border-chef-border px-3 py-1.5 text-left text-xs font-medium text-chef-sage hover:bg-chef-sage-light/30"
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}
