import { logger } from "mcp-framework";
import * as ynab from "ynab";
import { z } from "zod";
import { SerializingMCPTool, handleToolError } from "./base/SerializingMCPTool.js";
import {
  getBudgetCachePath,
  loadBudgetCache,
  mergeBudgetDelta,
  saveBudgetCache,
  summarizeBudgetCache,
} from "../utils/budgetCache.js";

interface SyncBudgetDeltaInput {
  budgetId?: string;
  forceFull?: boolean;
}

class SyncBudgetDeltaTool extends SerializingMCPTool<SyncBudgetDeltaInput> {
  name = "sync_budget_delta";
  description =
    "Sync the local YNAB cache using YNAB server_knowledge deltas. Run this before cache reads when the local cache may be stale. Uses YNAB only for sync; ordinary budget questions should read from read_budget_cache.";

  schema = z.object({
    budgetId: z
      .string()
      .optional()
      .describe("Budget ID to sync. Defaults to YNAB_BUDGET_ID from the personal .env."),
    forceFull: z
      .boolean()
      .optional()
      .default(false)
      .describe("When true, ignore previous server knowledge and rebuild the cache from a full budget pull."),
  });

  private api: ynab.API;

  constructor() {
    super();
    this.api = new ynab.API(process.env.YNAB_API_TOKEN || "");
  }

  protected async executeInternal(input: SyncBudgetDeltaInput) {
    const token = process.env.YNAB_API_TOKEN || process.env.YNAB_TOKEN;
    const budgetId = input.budgetId || process.env.YNAB_BUDGET_ID || "";
    const cachePath = getBudgetCachePath();

    if (!token) {
      return handleToolError("YNAB API Token is not set. Set YNAB_API_TOKEN in the personal .env.");
    }

    if (!budgetId) {
      return handleToolError("Budget ID is required. Set YNAB_BUDGET_ID in the personal .env.");
    }

    const existing = loadBudgetCache(cachePath);
    const canDelta =
      !input.forceFull &&
      existing?.budgetId === budgetId &&
      typeof existing.serverKnowledge === "number";

    logger.info(
      `Syncing budget ${budgetId} to ${cachePath} (${canDelta ? "delta" : "full"} mode)`
    );

    try {
      const response = canDelta
        ? await this.api.budgets.getBudgetById(budgetId, existing.serverKnowledge)
        : await this.api.budgets.getBudgetById(budgetId);
      const incomingBudget = response.data.budget as unknown as Record<string, any>;
      const serverKnowledge = response.data.server_knowledge;
      const nextCache = canDelta
        ? mergeBudgetDelta(existing, budgetId, serverKnowledge, incomingBudget)
        : mergeBudgetDelta(null, budgetId, serverKnowledge, incomingBudget);

      saveBudgetCache(nextCache, cachePath);

      return {
        success: true,
        mode: canDelta ? "delta" : "full",
        cache_path: cachePath,
        budget_id: nextCache.budgetId,
        budget_name: nextCache.budgetName,
        previous_server_knowledge: canDelta ? existing?.serverKnowledge : null,
        server_knowledge: nextCache.serverKnowledge,
        last_synced_at: nextCache.lastSyncedAt,
        counts: summarizeBudgetCache(cachePath).counts,
      };
    } catch (error) {
      return handleToolError(error, "syncing budget delta");
    }
  }
}

export default SyncBudgetDeltaTool;
