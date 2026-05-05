import { beforeEach, describe, expect, it, vi } from "vitest";
import UpdateScheduledTransactionTool from "../UpdateScheduledTransactionTool";
import * as ynab from "ynab";

vi.mock("ynab", () => ({
  API: vi.fn(),
}));

vi.mock("mcp-framework", () => ({
  MCPTool: class MockMCPTool {},
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe("UpdateScheduledTransactionTool", () => {
  let mockApi: any;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.YNAB_API_TOKEN = "test-token";
    process.env.YNAB_BUDGET_ID = "test-budget";

    mockApi = {
      scheduledTransactions: {
        updateScheduledTransaction: vi.fn(),
      },
    };

    (ynab.API as any).mockImplementation(() => mockApi);
  });

  it("updates an existing scheduled transaction", async () => {
    mockApi.scheduledTransactions.updateScheduledTransaction.mockResolvedValue({
      data: {
        scheduled_transaction: {
          id: "scheduled-1",
          date_next: "2026-04-01",
          frequency: "monthly",
          amount: -45000,
          payee_name: "Playwright Rent",
          memo: "Updated memo",
        },
      },
    });

    const tool = new UpdateScheduledTransactionTool();
    const result = JSON.parse(
      await tool.execute({
        scheduledTransactionId: "scheduled-1",
        memo: "Updated memo",
      })
    );

    expect(mockApi.scheduledTransactions.updateScheduledTransaction).toHaveBeenCalledWith(
      "test-budget",
      "scheduled-1",
      {
        scheduled_transaction: {
          memo: "Updated memo",
        },
      }
    );
    expect(result.scheduled_transaction_id).toBe("scheduled-1");
    expect(result.memo).toBe("Updated memo");
  });

  it("returns an error when no update fields are provided", async () => {
    const tool = new UpdateScheduledTransactionTool();
    const result = await tool.execute({
      scheduledTransactionId: "scheduled-1",
    });

    expect(result).toBe("ERROR: At least one field to update is required.");
  });
});