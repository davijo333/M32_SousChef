import { applyPipelineEnrichment } from "@backend/services/bills/apply-pipeline-enrichment";
import { executeFinalizeRecipeBuild } from "@backend/services/agents/agent-recipe-build";
import { executeInventoryPendingAction } from "@backend/services/agents/agent-inventory-actions";
import { executeMenuPendingAction } from "@backend/services/agents/agent-menu-actions";
import type { ChatUploadBatchPayload } from "@backend/services/chat/chat-bill-upload-queue";
import { ingestBill } from "@backend/services/bills/bill-ingest";
import { pruneOldBillUploads } from "@backend/services/bills/bill-retention";
import { extractNewItemsFromBill } from "@backend/services/catalog/extract-new-items";
import { connectDB } from "@backend/services/infra/mongodb";
import { BillUpload } from "@backend/models/BillUpload";

export type AgentPendingAction = {
  kind:
    | "process_purchase_bills"
    | "process_sales_bills"
    | "update_reorder_threshold"
    | "create_ingredient"
    | "update_ingredient"
    | "delete_ingredient"
    | "generate_dish_image"
    | "generate_ingredient_image"
    | "create_dish"
    | "update_dish"
    | "delete_dish"
    | "link_dish_ingredients"
    | "create_addon"
    | "update_addon"
    | "delete_addon"
    | "link_addon_ingredients"
    | "enrich_dish_description"
    | "update_dish_price"
    | "finalize_recipe_build";
  billIds?: string[];
  billType?: "supplier" | "customer";
  slug?: string;
  reorderThreshold?: number;
  ingredientName?: string;
  dishName?: string;
  description?: string;
  classification?: string;
  sellPrice?: number;
  imageMode?: "pair" | "secondary";
  ingredientSlugs?: string[];
  linkedDishSlugs?: string[];
  category?: string;
  inventoryUnit?: string;
  currentQty?: number;
  brandName?: string;
  lastPurchasePrice?: number;
  lastOrderedQty?: number;
  linkMode?: "add" | "remove" | "set";
  qtyPerServing?: number;
  unit?: string;
  imageUrl?: string;
  label?: "new" | "used" | "unused" | "missing";
  recipeBuildPlan?: import("@backend/services/recipes/recipe-build-plan").RecipeBuildPlanPayload;
};

export type AgentNavigationAction = {
  path: string;
  label: string;
  agent?: "inventory" | "business" | "create";
};

const MENU_ACTION_KINDS = new Set<AgentPendingAction["kind"]>([
  "generate_dish_image",
  "generate_ingredient_image",
  "create_dish",
  "update_dish",
  "delete_dish",
  "link_dish_ingredients",
  "create_addon",
  "update_addon",
  "delete_addon",
  "link_addon_ingredients",
  "enrich_dish_description",
  "update_dish_price",
]);

const INVENTORY_CATALOG_KINDS = new Set<AgentPendingAction["kind"]>([
  "create_ingredient",
  "update_ingredient",
  "delete_ingredient",
  "update_reorder_threshold",
]);

export async function executeAgentPendingAction(
  restaurantId: string,
  userId: string,
  action: AgentPendingAction
): Promise<string> {
  if (action.kind === "finalize_recipe_build") {
    if (!action.recipeBuildPlan) throw new Error("Recipe build plan missing.");
    return executeFinalizeRecipeBuild(restaurantId, action.recipeBuildPlan);
  }

  if (MENU_ACTION_KINDS.has(action.kind)) {
    return executeMenuPendingAction(restaurantId, action);
  }

  if (INVENTORY_CATALOG_KINDS.has(action.kind)) {
    return executeInventoryPendingAction(restaurantId, action);
  }

  await connectDB();

  const billType =
    action.kind === "process_sales_bills"
      ? "customer"
      : action.kind === "process_purchase_bills"
        ? "supplier"
        : action.billType;

  const ids = action.billIds ?? [];
  if (!ids.length) {
    throw new Error("No bills to process.");
  }

  const messages: string[] = [];
  let okCount = 0;

  for (const id of ids) {
    const query: Record<string, unknown> = { _id: id, restaurantId };
    if (billType) query.billType = billType;

    const bill = await BillUpload.findOne(query);
    if (!bill) {
      messages.push(`Bill ${id}: not found.`);
      continue;
    }

    if (bill.status === "confirmed") {
      messages.push(`${bill.filename}: already processed.`);
      okCount += 1;
      continue;
    }

    const result = await ingestBill(bill, restaurantId).catch((err: unknown) => ({
      billId: id,
      ok: false as const,
      updatedIngredients: 0,
      createdIngredients: 0,
      deductedIngredients: 0,
      message: "",
      error: err instanceof Error ? err.message : "Processing failed",
    }));

    if (result.ok) {
      okCount += 1;
      messages.push(result.message || `${bill.filename}: processed.`);
      extractNewItemsFromBill({
        billId: bill._id.toString(),
        filename: bill.filename,
        vendor: bill.vendor,
        billType: bill.billType,
        lines: bill.lines,
      });
      if (bill.pipelineEnriched?.length) {
        applyPipelineEnrichment([], bill.pipelineEnriched);
      }
    } else {
      messages.push(result.error ?? `${bill.filename}: processing failed.`);
    }
  }

  if (userId && okCount > 0 && billType) {
    await pruneOldBillUploads(userId, billType);
  }

  if (!messages.length) {
    throw new Error("Bill processing failed.");
  }
  return messages.join("\n");
}

async function getPendingBillIdsForUser(
  userId: string,
  billType: "supplier" | "customer"
): Promise<string[]> {
  await connectDB();
  const bills = await BillUpload.find({ userId, billType, status: "pending_review" })
    .sort({ createdAt: 1 })
    .select("_id")
    .lean();
  return bills.map((bill) => bill._id.toString());
}

/** Process confirmed chat uploads: purchase orders first, then sales receipts. */
export async function executeConfirmedUploadBatch(
  restaurantId: string,
  userId: string,
  uploadBatch?: ChatUploadBatchPayload
): Promise<string | null> {
  const purchaseSlice = uploadBatch?.slices.find(
    (slice) => slice.billType === "supplier" && slice.readyBillIds.length > 0
  );
  const salesSlice = uploadBatch?.slices.find(
    (slice) => slice.billType === "customer" && slice.readyBillIds.length > 0
  );

  let purchaseIds = purchaseSlice?.readyBillIds ?? [];
  let salesIds = salesSlice?.readyBillIds ?? [];

  if (!purchaseIds.length) {
    purchaseIds = await getPendingBillIdsForUser(userId, "supplier");
  }
  if (!salesIds.length) {
    salesIds = await getPendingBillIdsForUser(userId, "customer");
  }

  const messages: string[] = [];

  if (purchaseIds.length) {
    messages.push(
      await executeAgentPendingAction(restaurantId, userId, {
        kind: "process_purchase_bills",
        billIds: purchaseIds,
        billType: "supplier",
      })
    );
  }

  if (salesIds.length) {
    try {
      messages.push(
        await executeAgentPendingAction(restaurantId, userId, {
          kind: "process_sales_bills",
          billIds: salesIds,
          billType: "customer",
        })
      );
    } catch (err) {
      messages.push(err instanceof Error ? err.message : "Sales bill processing failed.");
    }
  }

  if (!messages.length) {
    return null;
  }
  return messages.join("\n\n");
}

export function detectInventoryConfirm(message: string, agentContext: string): boolean {
  if (agentContext !== "inventory") return false;
  return (
    /\b(yes|confirm|go ahead|process(?:\s+it|\s+them|\s+bills?)?|do it|approved?|sure|create it|update it|delete it|remove it|add it|link it|save (it|that)|apply|build it)\b/i.test(
      message
    ) ||
    /\b(add|create)\b[\s\S]{0,40}\b(ingredient|ingredients|pantry)\b[\s\S]{0,40}\b(qty|quantity)\s*0\b/i.test(
      message
    ) ||
    /\b(add|create)\b[\s\S]{0,40}\b(ingredient|ingredients|pantry)\b[\s\S]{0,40}\bzero\b/i.test(
      message
    ) ||
    /\b(add|create|build)\b[\s\S]{0,40}\b(dish|dishes|add-?on|add ons?|recipe)\b/i.test(message) ||
    /\bprocess\b[\s\S]{0,30}\b(sales|receipt|pos)\b/i.test(message)
  );
}

export function detectBusinessConfirm(message: string, agentContext: string): boolean {
  if (agentContext !== "business") return false;
  return /\b(yes|confirm|go ahead|process(?:\s+it|\s+them|\s+bills?)?|do it|approved?|sure|apply)\b/i.test(
    message
  );
}

export function detectMenuConfirm(message: string, agentContext: string): boolean {
  if (agentContext !== "create") return false;
  return /\b(yes|confirm|go ahead|create it|update it|save (it|that)|add it|link it|delete it|remove it|do it|approved?|sure)\b/i.test(
    message
  );
}
