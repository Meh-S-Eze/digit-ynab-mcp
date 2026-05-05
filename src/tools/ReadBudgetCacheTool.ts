import { z } from "zod";
import { SerializingMCPTool } from "./base/SerializingMCPTool.js";
import { readBudgetCacheSection } from "../utils/budgetCache.js";

interface ReadBudgetCacheInput {
  section?: string;
  budgetId?: string;
  includeDeleted?: boolean;
  limit?: number;
  search?: string;
  since?: string;
  until?: string;
  accountId?: string;
  accountName?: string;
  categoryId?: string;
  categoryName?: string;
  payeeName?: string;
  month?: string;
  unapprovedOnly?: boolean;
  unclearedOnly?: boolean;
}

class ReadBudgetCacheTool extends SerializingMCPTool<ReadBudgetCacheInput> {
  name = "read_budget_cache";
  description =
    "Read budget data from the local delta-synced cache. Use this for normal read-only budget questions instead of live YNAB read tools. If cache is missing or stale, run sync_budget_delta first.";

  schema = z.object({
    section: z
      .enum([
        "summary",
        "metadata",
        "accounts",
        "categories",
        "payees",
        "transactions",
        "scheduled_transactions",
        "month",
      ])
      .optional()
      .default("summary")
      .describe("Which cached budget section to read."),
    budgetId: z.string().optional().describe("Optional cache budget guard."),
    includeDeleted: z.boolean().optional().default(false),
    limit: z.number().int().positive().max(500).optional().default(100),
    search: z.string().optional().describe("Case-insensitive search over common display fields."),
    since: z.string().optional().describe("Transaction start date in YYYY-MM-DD."),
    until: z.string().optional().describe("Transaction end date in YYYY-MM-DD."),
    accountId: z.string().optional(),
    accountName: z.string().optional(),
    categoryId: z.string().optional(),
    categoryName: z.string().optional(),
    payeeName: z.string().optional(),
    month: z.string().optional().describe("Budget month in YYYY-MM-01 format for section=month."),
    unapprovedOnly: z.boolean().optional().default(false),
    unclearedOnly: z.boolean().optional().default(false),
  });

  protected async executeInternal(input: ReadBudgetCacheInput) {
    return readBudgetCacheSection(input);
  }
}

export default ReadBudgetCacheTool;
