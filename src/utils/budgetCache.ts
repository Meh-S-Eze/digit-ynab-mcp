import fs from "fs";
import path from "path";

export interface BudgetCacheFile {
  version: 1;
  budgetId: string;
  budgetName?: string;
  serverKnowledge: number;
  lastSyncedAt: string;
  lastFullSyncAt: string;
  budget: Record<string, any>;
}

export interface BudgetCacheSummary {
  exists: boolean;
  path: string;
  budgetId?: string;
  budgetName?: string;
  serverKnowledge?: number;
  lastSyncedAt?: string;
  lastFullSyncAt?: string;
  counts?: Record<string, number>;
}

const DEFAULT_CACHE_PATH = path.join(
  process.env.HOME || process.cwd(),
  ".ynab-mcp",
  "budget-cache.json"
);

const ARRAY_KEYS = [
  "accounts",
  "payees",
  "payee_locations",
  "category_groups",
  "categories",
  "months",
  "transactions",
  "subtransactions",
  "scheduled_transactions",
  "scheduled_subtransactions",
];

export function getBudgetCachePath(env: NodeJS.ProcessEnv = process.env): string {
  return path.resolve(env.YNAB_MCP_CACHE_PATH || DEFAULT_CACHE_PATH);
}

export function loadBudgetCache(cachePath = getBudgetCachePath()): BudgetCacheFile | null {
  if (!fs.existsSync(cachePath)) {
    return null;
  }

  const parsed = JSON.parse(fs.readFileSync(cachePath, "utf8")) as BudgetCacheFile;
  if (parsed.version !== 1 || !parsed.budgetId || !parsed.budget) {
    throw new Error(`Invalid YNAB MCP cache file: ${cachePath}`);
  }
  return parsed;
}

export function saveBudgetCache(cache: BudgetCacheFile, cachePath = getBudgetCachePath()): BudgetCacheFile {
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  const tmpPath = `${cachePath}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(cache, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tmpPath, cachePath);
  fs.chmodSync(cachePath, 0o600);
  return cache;
}

export function summarizeBudgetCache(cachePath = getBudgetCachePath()): BudgetCacheSummary {
  const cache = loadBudgetCache(cachePath);
  if (!cache) {
    return {
      exists: false,
      path: cachePath,
    };
  }

  return {
    exists: true,
    path: cachePath,
    budgetId: cache.budgetId,
    budgetName: cache.budgetName,
    serverKnowledge: cache.serverKnowledge,
    lastSyncedAt: cache.lastSyncedAt,
    lastFullSyncAt: cache.lastFullSyncAt,
    counts: countBudgetEntities(cache.budget),
  };
}

export function createBudgetCache(
  budgetId: string,
  budgetName: string | undefined,
  serverKnowledge: number,
  budget: Record<string, any>
): BudgetCacheFile {
  const now = new Date().toISOString();
  return {
    version: 1,
    budgetId,
    budgetName,
    serverKnowledge,
    lastSyncedAt: now,
    lastFullSyncAt: now,
    budget,
  };
}

export function mergeBudgetDelta(
  existing: BudgetCacheFile | null,
  budgetId: string,
  serverKnowledge: number,
  incomingBudget: Record<string, any>
): BudgetCacheFile {
  if (!existing || existing.budgetId !== budgetId) {
    return createBudgetCache(budgetId, incomingBudget.name, serverKnowledge, incomingBudget);
  }

  const mergedBudget = mergeObjects(existing.budget, incomingBudget);
  return {
    ...existing,
    budgetName: mergedBudget.name || existing.budgetName,
    serverKnowledge,
    lastSyncedAt: new Date().toISOString(),
    budget: mergedBudget,
  };
}

export function readBudgetCacheSection(
  options: {
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
  },
  cachePath = getBudgetCachePath()
) {
  const cache = loadBudgetCache(cachePath);
  if (!cache) {
    return {
      cache_hit: false,
      cache_path: cachePath,
      message: "No local YNAB cache exists yet. Run sync_budget_delta first.",
    };
  }

  if (options.budgetId && options.budgetId !== cache.budgetId) {
    return {
      cache_hit: false,
      cache_path: cachePath,
      message: `Cache is for budget ${cache.budgetId}, not requested budget ${options.budgetId}. Run sync_budget_delta for the requested budget first.`,
    };
  }

  const limit = Math.max(1, Math.min(options.limit || 100, 500));
  const section = options.section || "summary";
  const includeDeleted = Boolean(options.includeDeleted);
  const budget = cache.budget;
  const metadata = {
    cache_hit: true,
    cache_path: cachePath,
    budget_id: cache.budgetId,
    budget_name: cache.budgetName || budget.name,
    server_knowledge: cache.serverKnowledge,
    last_synced_at: cache.lastSyncedAt,
    last_full_sync_at: cache.lastFullSyncAt,
  };

  if (section === "metadata") {
    return {
      ...metadata,
      counts: countBudgetEntities(budget),
    };
  }

  if (section === "accounts") {
    return {
      ...metadata,
      accounts: filterDeleted(budget.accounts || [], includeDeleted).map(formatAccount),
    };
  }

  if (section === "categories") {
    return {
      ...metadata,
      categories: filterBySearch(
        flattenCategories(budget).filter((category) => includeDeleted || !category.deleted),
        options.search || options.categoryName,
        ["name", "category_group_name"]
      ).map(formatCategory),
    };
  }

  if (section === "payees") {
    return {
      ...metadata,
      payees: filterBySearch(
        filterDeleted(budget.payees || [], includeDeleted),
        options.search || options.payeeName,
        ["name"]
      )
        .slice(0, limit)
        .map(formatPayee),
      limit,
    };
  }

  if (section === "scheduled_transactions") {
    const scheduled = filterBySearch(
      filterDeleted(budget.scheduled_transactions || [], includeDeleted),
      options.search || options.payeeName || options.accountName,
      ["memo", "payee_name", "account_name"]
    );
    return {
      ...metadata,
      scheduled_transactions: scheduled.slice(0, limit).map(formatScheduledTransaction),
      total_matching: scheduled.length,
      limit,
    };
  }

  if (section === "transactions") {
    const transactions = filterTransactions(
      filterDeleted(budget.transactions || [], includeDeleted),
      options
    ).sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
    return {
      ...metadata,
      transactions: transactions.slice(0, limit).map(formatTransaction),
      total_matching: transactions.length,
      limit,
    };
  }

  if (section === "month") {
    const month = options.month || currentMonth();
    const monthDetail = (budget.months || []).find((entry: any) => entry.month === month);
    return {
      ...metadata,
      month,
      month_detail: monthDetail ? formatMonth(monthDetail) : null,
    };
  }

  return {
    ...metadata,
    counts: countBudgetEntities(budget),
    accounts: filterDeleted(budget.accounts || [], false).map(formatAccount),
    current_month: formatMonth((budget.months || []).find((entry: any) => entry.month === currentMonth())),
    recent_transactions: filterDeleted(budget.transactions || [], false)
      .sort((a: any, b: any) => String(b.date || "").localeCompare(String(a.date || "")))
      .slice(0, Math.min(limit, 25))
      .map(formatTransaction),
  };
}

function mergeObjects(existing: Record<string, any>, incoming: Record<string, any>): Record<string, any> {
  const merged: Record<string, any> = { ...existing, ...incoming };

  for (const key of ARRAY_KEYS) {
    if (!Array.isArray(incoming[key])) {
      continue;
    }

    if (key === "category_groups") {
      merged[key] = mergeCategoryGroups(existing[key] || [], incoming[key]);
    } else {
      merged[key] = mergeArrayById(existing[key] || [], incoming[key]);
    }
  }

  return merged;
}

function mergeArrayById(existing: any[], incoming: any[]): any[] {
  const byId = new Map<string, any>();
  const noId: any[] = [];

  for (const item of existing) {
    if (item?.id) byId.set(item.id, item);
    else noId.push(item);
  }

  for (const item of incoming) {
    if (item?.id) {
      byId.set(item.id, { ...(byId.get(item.id) || {}), ...item });
    } else {
      noId.push(item);
    }
  }

  return [...byId.values(), ...noId];
}

function mergeCategoryGroups(existing: any[], incoming: any[]): any[] {
  const byId = new Map<string, any>();
  for (const group of existing) {
    if (group?.id) byId.set(group.id, group);
  }

  for (const group of incoming) {
    if (!group?.id) continue;
    const previous = byId.get(group.id) || {};
    byId.set(group.id, {
      ...previous,
      ...group,
      categories: Array.isArray(group.categories)
        ? mergeArrayById(previous.categories || [], group.categories)
        : previous.categories,
    });
  }

  return [...byId.values()];
}

function filterDeleted(items: any[], includeDeleted: boolean): any[] {
  return includeDeleted ? items : items.filter((item) => !item?.deleted);
}

function filterBySearch(items: any[], search: string | undefined, fields: string[]): any[] {
  const needle = search?.trim().toLowerCase();
  if (!needle) return items;
  return items.filter((item) =>
    fields.some((field) => String(item?.[field] || "").toLowerCase().includes(needle))
  );
}

function filterTransactions(items: any[], options: any): any[] {
  return filterBySearch(items, options.search || options.payeeName || options.accountName || options.categoryName, [
    "memo",
    "payee_name",
    "account_name",
    "category_name",
  ]).filter((transaction) => {
    if (options.since && String(transaction.date || "") < options.since) return false;
    if (options.until && String(transaction.date || "") > options.until) return false;
    if (options.accountId && transaction.account_id !== options.accountId) return false;
    if (options.categoryId && transaction.category_id !== options.categoryId) return false;
    if (options.unapprovedOnly && transaction.approved) return false;
    if (options.unclearedOnly && transaction.cleared === "cleared") return false;
    return true;
  });
}

function flattenCategories(budget: Record<string, any>): any[] {
  if (Array.isArray(budget.categories) && budget.categories.length > 0) {
    return budget.categories;
  }

  return (budget.category_groups || []).flatMap((group: any) =>
    (group.categories || []).map((category: any) => ({
      ...category,
      category_group_id: category.category_group_id || group.id,
      category_group_name: category.category_group_name || group.name,
    }))
  );
}

function countBudgetEntities(budget: Record<string, any>): Record<string, number> {
  return {
    accounts: filterDeleted(budget.accounts || [], false).length,
    payees: filterDeleted(budget.payees || [], false).length,
    category_groups: filterDeleted(budget.category_groups || [], false).length,
    categories: flattenCategories(budget).filter((category) => !category.deleted).length,
    months: (budget.months || []).length,
    transactions: filterDeleted(budget.transactions || [], false).length,
    scheduled_transactions: filterDeleted(budget.scheduled_transactions || [], false).length,
  };
}

function formatAccount(account: any) {
  return {
    id: account.id,
    name: account.name,
    type: account.type,
    balance: milliToCurrency(account.balance),
    on_budget: account.on_budget,
    closed: account.closed,
  };
}

function formatCategory(category: any) {
  return {
    id: category.id,
    name: category.name,
    category_group_id: category.category_group_id,
    category_group_name: category.category_group_name,
    budgeted: milliToCurrency(category.budgeted),
    activity: milliToCurrency(category.activity),
    balance: milliToCurrency(category.balance),
  };
}

function formatPayee(payee: any) {
  return {
    id: payee.id,
    name: payee.name,
    transfer_account_id: payee.transfer_account_id || null,
  };
}

function formatTransaction(transaction: any) {
  return {
    id: transaction.id,
    date: transaction.date,
    amount: milliToCurrency(transaction.amount),
    account_id: transaction.account_id,
    account_name: transaction.account_name,
    payee_id: transaction.payee_id,
    payee_name: transaction.payee_name,
    category_id: transaction.category_id,
    category_name: transaction.category_name,
    memo: transaction.memo || null,
    cleared: transaction.cleared,
    approved: transaction.approved,
  };
}

function formatScheduledTransaction(transaction: any) {
  return {
    id: transaction.id,
    date_first: transaction.date_first,
    date_next: transaction.date_next,
    frequency: transaction.frequency,
    amount: milliToCurrency(transaction.amount),
    account_id: transaction.account_id,
    account_name: transaction.account_name,
    payee_id: transaction.payee_id,
    payee_name: transaction.payee_name,
    category_id: transaction.category_id,
    category_name: transaction.category_name,
    memo: transaction.memo || null,
  };
}

function formatMonth(month: any) {
  if (!month) return null;
  return {
    month: month.month,
    income: milliToCurrency(month.income),
    budgeted: milliToCurrency(month.budgeted),
    activity: milliToCurrency(month.activity),
    to_be_budgeted: milliToCurrency(month.to_be_budgeted),
    age_of_money: month.age_of_money,
  };
}

function milliToCurrency(value: unknown): number | null {
  if (typeof value !== "number") return null;
  return Number((value / 1000).toFixed(2));
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7) + "-01";
}
