import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import os from "os";
import path from "path";
import { createBudgetCache, readBudgetCacheSection, saveBudgetCache } from "../budgetCache.js";

const tempDirectories: string[] = [];

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function writeSyntheticCache() {
  const directory = mkdtempSync(path.join(os.tmpdir(), "ynab-mcp-cache-test-"));
  tempDirectories.push(directory);
  const cachePath = path.join(directory, "budget-cache.json");
  saveBudgetCache(
    createBudgetCache("budget-1", "Synthetic Budget", 42, {
      name: "Synthetic Budget",
      accounts: [
        { id: "account-1", name: "Checking", type: "checking", balance: 1000 },
        { id: "account-2", name: "Savings", type: "savings", balance: 2000 },
      ],
      payees: [{ id: "payee-1", name: "Grocery Store" }],
      category_groups: [
        { id: "group-1", name: "Everyday", categories: [{ id: "category-1", name: "Groceries" }] },
      ],
      transactions: [
        {
          id: "transaction-1",
          date: "2026-07-22",
          amount: -2500,
          account_id: "account-1",
          payee_id: "payee-1",
          category_id: "category-1",
          memo: "Synthetic purchase",
          cleared: "cleared",
          approved: true,
          import_id: "import-1",
          matched_transaction_id: "transaction-match",
          transfer_account_id: "account-2",
          transfer_transaction_id: "transaction-transfer",
          scheduled_transaction_id: "scheduled-1",
          deleted: false,
        },
        {
          id: "transaction-2",
          date: "2026-07-21",
          amount: -1000,
          account_id: "missing-account",
          payee_id: "missing-payee",
          category_id: "missing-category",
          account_name: "Existing Account Name",
          payee_name: "Existing Payee Name",
          category_name: "Existing Category Name",
          deleted: false,
        },
        {
          id: "transaction-deleted",
          date: "2026-07-20",
          amount: -3000,
          account_id: "account-1",
          deleted: true,
          import_id: "deleted-import",
        },
      ],
      scheduled_transactions: [
        {
          id: "scheduled-1",
          date_first: "2026-07-01",
          date_next: "2026-08-01",
          frequency: "monthly",
          amount: -50000,
          account_id: "account-1",
          payee_id: "payee-1",
          category_id: "category-1",
          memo: "Recurring groceries",
          transfer_account_id: "account-2",
          transfer_transaction_id: "scheduled-transfer",
          deleted: false,
        },
      ],
    }),
    cachePath
  );
  return cachePath;
}

describe("readBudgetCacheSection transaction enrichment", () => {
  it("joins display names from cached entities and supports name filters", () => {
    const result = readBudgetCacheSection(
      { section: "transactions", accountName: "checking", limit: 10 },
      writeSyntheticCache()
    );

    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]).toMatchObject({
      id: "transaction-1",
      account_name: "Checking",
      payee_name: "Grocery Store",
      category_name: "Groceries",
      import_id: "import-1",
      matched_transaction_id: "transaction-match",
      transfer_account_id: "account-2",
      transfer_transaction_id: "transaction-transfer",
      scheduled_transaction_id: "scheduled-1",
      deleted: false,
    });
  });

  it("enriches scheduled names before filtering and preserves transfer metadata", () => {
    const result = readBudgetCacheSection(
      { section: "scheduled_transactions", search: "grocery", limit: 10 },
      writeSyntheticCache()
    );

    expect(result.scheduled_transactions).toHaveLength(1);
    expect(result.scheduled_transactions[0]).toMatchObject({
      id: "scheduled-1",
      account_name: "Checking",
      payee_name: "Grocery Store",
      category_name: "Groceries",
      transfer_account_id: "account-2",
      transfer_transaction_id: "scheduled-transfer",
      deleted: false,
    });
  });

  it("returns deleted transaction metadata only when requested", () => {
    const result = readBudgetCacheSection(
      { section: "transactions", includeDeleted: true, limit: 10 },
      writeSyntheticCache()
    );

    const deletedTransaction = result.transactions.find(
      (transaction: any) => transaction.id === "transaction-deleted"
    );
    expect(deletedTransaction).toMatchObject({
      id: "transaction-deleted",
      import_id: "deleted-import",
      deleted: true,
    });
  });

  it("preserves existing names and leaves unresolved relationships unchanged", () => {
    const result = readBudgetCacheSection(
      { section: "transactions", search: "existing payee", limit: 10 },
      writeSyntheticCache()
    );

    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]).toMatchObject({
      id: "transaction-2",
      account_name: "Existing Account Name",
      payee_name: "Existing Payee Name",
      category_name: "Existing Category Name",
    });
  });
});
