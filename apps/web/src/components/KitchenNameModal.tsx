"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { KITCHEN_NAME_MAX, validateKitchenName } from "@/lib/kitchen-name";
import { loadTestDataAndNotify } from "@/lib/load-test-data";

type Props = {
  open: boolean;
  required?: boolean;
  initialName?: string;
  title?: string;
  description?: string;
  onClose?: () => void;
  onSaved: (name: string) => void;
};

export function KitchenNameModal({
  open,
  required = false,
  initialName = "",
  title,
  description,
  onClose,
  onSaved,
}: Props) {
  const { update } = useSession();
  const [name, setName] = useState(initialName);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadingTestData, setLoadingTestData] = useState(false);

  useEffect(() => {
    if (open) {
      setName(initialName);
      setError("");
      setAvailable(null);
    }
  }, [open, initialName]);

  useEffect(() => {
    if (!open) return;
    const trimmed = name.trim();
    const validationError = validateKitchenName(trimmed);
    if (validationError || trimmed === initialName.trim()) {
      setAvailable(null);
      return;
    }

    const timer = window.setTimeout(async () => {
      setChecking(true);
      try {
        const res = await fetch(
          `/api/restaurant/check-name?name=${encodeURIComponent(trimmed)}`
        );
        const data = await res.json();
        if (!res.ok) {
          setAvailable(null);
          setError((data.error as string) ?? "Could not check name availability");
          return;
        }
        setAvailable(Boolean(data.available));
        if (!data.available && data.error) {
          setError(data.error);
        } else {
          setError("");
        }
      } catch {
        setAvailable(null);
      } finally {
        setChecking(false);
      }
    }, 400);

    return () => window.clearTimeout(timer);
  }, [name, open, initialName]);

  if (!open) return null;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const trimmed = name.trim();
    if (!required && trimmed === initialName.trim()) {
      onClose?.();
      return;
    }

    const validationError = validateKitchenName(name);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/restaurant", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAvailable(null);
        setError((data.error as string) ?? "Could not save kitchen name");
        return;
      }

      await update({
        restaurantName: data.name as string,
        kitchenNameSet: true,
        ...(data.restaurantId ? { restaurantId: data.restaurantId as string } : {}),
      });

      onSaved(data.name as string);
      if (!required) onClose?.();
    } catch {
      setError("Network error — try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleLoadTestData() {
    setLoadingTestData(true);
    setError("");
    try {
      const result = await loadTestDataAndNotify();
      if (!result.ok) {
        setError(result.error ?? "Could not load test data.");
        return;
      }

      const kitchenName = result.restaurant ?? "Panera Cafe";
      await update({
        restaurantName: kitchenName,
        kitchenNameSet: true,
      });
      onSaved(kitchenName);
    } catch {
      setError("Network error — try again.");
    } finally {
      setLoadingTestData(false);
    }
  }

  const heading = title ?? (required ? "Name your kitchen" : "Edit kitchen name");
  const subtext =
    description ??
    (required
      ? "Pick a unique name for your restaurant or café. This is how your kitchen appears across Sous Chef."
      : "Choose a new unique name for your kitchen.");

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-chef-text/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="kitchen-name-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-chef-border bg-chef-surface p-6 shadow-xl">
        <h2 id="kitchen-name-title" className="text-xl font-semibold text-chef-text">
          {heading}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-chef-text-muted">{subtext}</p>

        <form onSubmit={handleSave} className="mt-5 space-y-3">
          <div>
            <label htmlFor="kitchen-name-input" className="block text-sm font-medium text-chef-text">
              Kitchen name
            </label>
            <input
              id="kitchen-name-input"
              type="text"
              required
              maxLength={KITCHEN_NAME_MAX}
              autoFocus
              placeholder="Panera Cafe"
              className="mt-1.5 w-full rounded-lg border border-chef-border bg-white px-3 py-2.5 text-chef-text outline-none ring-chef-sage/30 focus:border-chef-sage focus:ring-2"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError("");
                setAvailable(null);
              }}
            />
            <div className="mt-1.5 flex min-h-[1.25rem] items-center justify-between text-xs">
              {checking && <span className="text-chef-text-muted">Checking availability…</span>}
              {!checking && !error && available === true && name.trim() !== initialName.trim() && (
                <span className="text-chef-sage">Name is available</span>
              )}
              {!checking && !error && available === false && (
                <span className="text-red-600">Name is taken</span>
              )}
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            {required ? (
              <button
                type="button"
                onClick={() => void handleLoadTestData()}
                disabled={saving || loadingTestData || checking}
                className="rounded-lg border border-chef-border bg-white px-4 py-2 text-sm font-medium text-chef-text hover:bg-chef-muted disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loadingTestData ? "Loading test data…" : "Load test data"}
              </button>
            ) : (
              <span />
            )}
            <div className="flex flex-wrap justify-end gap-2">
              {!required && onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  disabled={saving || loadingTestData}
                  className="rounded-lg border border-chef-border px-4 py-2 text-sm font-medium text-chef-text-muted hover:bg-chef-muted disabled:opacity-50"
                >
                  Cancel
                </button>
              )}
              <button
                type="submit"
                disabled={saving || loadingTestData || checking || available === false}
                className="sc-btn-primary px-5 py-2 text-sm disabled:opacity-50"
              >
                {saving ? "Saving…" : required ? "Continue" : "Save name"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
