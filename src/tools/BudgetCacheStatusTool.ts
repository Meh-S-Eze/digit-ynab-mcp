import { z } from "zod";
import { SerializingMCPTool } from "./base/SerializingMCPTool.js";
import { summarizeBudgetCache } from "../utils/budgetCache.js";

class BudgetCacheStatusTool extends SerializingMCPTool {
  name = "budget_cache_status";
  description =
    "Show local YNAB cache status, including cache path, last sync time, server knowledge, and cached entity counts. Use this before deciding whether to run sync_budget_delta.";

  schema = z.object({});

  protected async executeInternal() {
    return summarizeBudgetCache();
  }
}

export default BudgetCacheStatusTool;
