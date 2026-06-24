export const TEST_DATA_LOADED_EVENT = "souschef:test-data-loaded";

export function notifyTestDataLoaded() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(TEST_DATA_LOADED_EVENT));
  }
}

export type LoadTestDataResult = {
  ok: boolean;
  error?: string;
  message?: string;
  restaurant?: string;
  ingredients?: number;
  dishes?: number;
  addOns?: number;
  recipes?: number;
  salesOrders?: number;
  purchaseOrders?: number;
};

export async function loadTestData(): Promise<LoadTestDataResult> {
  const res = await fetch("/api/seed?force=1", { method: "POST" });
  let payload: LoadTestDataResult & { error?: string };
  try {
    payload = (await res.json()) as LoadTestDataResult & { error?: string };
  } catch {
    return { ok: false, error: "Invalid response from server." };
  }

  if (!res.ok || payload.ok === false) {
    return { ok: false, error: payload.error ?? "Could not load test data." };
  }

  const counts = [
    payload.ingredients ?? 0,
    payload.dishes ?? 0,
    payload.addOns ?? 0,
    payload.recipes ?? 0,
    payload.salesOrders ?? 0,
    payload.purchaseOrders ?? 0,
  ];

  return {
    ...payload,
    ok: true,
    message: `Loaded ${counts[0]} ingredients, ${counts[1]} dishes, ${counts[2]} add-ons, ${counts[3]} recipes, ${counts[4]} sales orders, and ${counts[5]} purchase orders.`,
  };
}

export async function loadTestDataAndNotify(): Promise<LoadTestDataResult> {
  const result = await loadTestData();
  if (result.ok) {
    notifyTestDataLoaded();
  }
  return result;
}
