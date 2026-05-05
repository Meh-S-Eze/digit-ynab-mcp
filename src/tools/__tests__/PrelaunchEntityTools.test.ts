import { beforeEach, describe, expect, it, vi } from "vitest";
import CreateAccountTool from "../CreateAccountTool";
import CreateCategoryGroupTool from "../CreateCategoryGroupTool";
import CreateCategoryTool from "../CreateCategoryTool";
import CreatePayeeTool from "../CreatePayeeTool";
import ListCategoryGroupsTool from "../ListCategoryGroupsTool";
import UpdateCategoryGroupTool from "../UpdateCategoryGroupTool";
import UpdateCategoryTool from "../UpdateCategoryTool";
import {
  getCategoryGroups,
  requestYnabApi,
} from "../../utils/YnabRestApi";
import { createCategoryViaCurrentYnabSdk } from "../../utils/YnabCurrentSdkCategoryCreate";

vi.mock("mcp-framework", () => ({
  MCPTool: class MockMCPTool {},
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../../utils/YnabRestApi", () => ({
  requestYnabApi: vi.fn(),
  getCategoryGroups: vi.fn(),
  getCategories: vi.fn(),
  normalizeYnabName: (value: string | null | undefined) =>
    typeof value === "string" ? value.trim().toLowerCase() : "",
}));

vi.mock("../../utils/YnabCurrentSdkCategoryCreate", () => ({
  createCategoryViaCurrentYnabSdk: vi.fn(),
}));

function parseJsonResult(raw: string) {
  return JSON.parse(raw);
}

describe("Prelaunch entity MCP tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.YNAB_API_TOKEN = "test-token";
    process.env.YNAB_BUDGET_ID = "test-budget";
  });

  it("create_account returns an exact-name match instead of creating a duplicate", async () => {
    (requestYnabApi as any).mockResolvedValueOnce({
      data: {
        accounts: [
          {
            id: "account-1",
            name: "Playwright Checking",
            type: "checking",
            balance: 125000,
            deleted: false,
          },
        ],
      },
    });

    const tool = new CreateAccountTool();
    const result = parseJsonResult(
      await tool.execute({
        name: "Playwright Checking",
        type: "checking",
      })
    );

    expect(result.existed).toBe(true);
    expect(result.account_id).toBe("account-1");
    expect(requestYnabApi).toHaveBeenCalledTimes(1);
  });

  it("create_payee creates a new payee when no exact-name match exists", async () => {
    (requestYnabApi as any)
      .mockResolvedValueOnce({
        data: {
          payees: [],
        },
      })
      .mockResolvedValueOnce({
        data: {
          payee: {
            id: "payee-1",
            name: "Playwright Coffee",
          },
        },
      });

    const tool = new CreatePayeeTool();
    const result = parseJsonResult(
      await tool.execute({
        name: "Playwright Coffee",
      })
    );

    expect(result.existed).toBe(false);
    expect(result.payee_id).toBe("payee-1");
    expect(requestYnabApi).toHaveBeenCalledTimes(2);
  });

  it("list_category_groups returns simplified group summaries", async () => {
    (getCategoryGroups as any).mockResolvedValue([
      {
        id: "group-1",
        name: "Everyday",
        hidden: false,
        deleted: false,
        categories: [{ id: "cat-1" }, { id: "cat-2" }],
      },
    ]);

    const tool = new ListCategoryGroupsTool();
    const result = parseJsonResult(await tool.execute({}));

    expect(result.category_groups).toEqual([
      {
        id: "group-1",
        name: "Everyday",
        hidden: false,
        deleted: false,
        category_count: 2,
      },
    ]);
  });

  it("create_category_group returns the existing group when the exact name already exists", async () => {
    (getCategoryGroups as any).mockResolvedValue([
      {
        id: "group-1",
        name: "Playwright Group",
        deleted: false,
      },
    ]);

    const tool = new CreateCategoryGroupTool();
    const result = parseJsonResult(
      await tool.execute({
        name: "Playwright Group",
      })
    );

    expect(result.existed).toBe(true);
    expect(result.category_group_id).toBe("group-1");
    expect(requestYnabApi).not.toHaveBeenCalled();
  });

  it("create_category respects idempotency within the target group", async () => {
    (getCategoryGroups as any).mockResolvedValue([
      {
        id: "group-1",
        name: "Everyday",
        deleted: false,
        categories: [
          {
            id: "cat-1",
            name: "Playwright Category",
            category_group_id: "group-1",
            deleted: false,
          },
        ],
      },
    ]);

    const tool = new CreateCategoryTool();
    const result = parseJsonResult(
      await tool.execute({
        name: "Playwright Category",
        categoryGroupId: " group-1 ",
      })
    );

    expect(result.existed).toBe(true);
    expect(result.category_id).toBe("cat-1");
    expect(createCategoryViaCurrentYnabSdk).not.toHaveBeenCalled();
  });

  it("create_category sends the canonical group ID and trimmed category name", async () => {
    (getCategoryGroups as any).mockResolvedValue([
      {
        id: "group-2",
        name: "Everyday",
        deleted: false,
        categories: [],
      },
    ]);
    (createCategoryViaCurrentYnabSdk as any).mockResolvedValueOnce({
      id: "cat-2",
      name: "Playwright New Category",
      category_group_id: "group-2",
    });

    const tool = new CreateCategoryTool();
    const result = parseJsonResult(
      await tool.execute({
        budgetId: " test-budget ",
        name: " Playwright New Category ",
        categoryGroupId: " group-2 ",
      })
    );

    expect(result.existed).toBe(false);
    expect(result.category_id).toBe("cat-2");
    expect(createCategoryViaCurrentYnabSdk).toHaveBeenCalledWith({
      planId: "test-budget",
      name: "Playwright New Category",
      categoryGroupId: "group-2",
      note: undefined,
      goalTargetMilliunits: undefined,
      goalTargetDate: undefined,
    });
  });

  it("create_category fails before posting when the group is not in the budget", async () => {
    (getCategoryGroups as any).mockResolvedValue([
      {
        id: "group-3",
        name: "Different Group",
        deleted: false,
        categories: [],
      },
    ]);

    const tool = new CreateCategoryTool();
    const result = await tool.execute({
      budgetId: "wrong-budget",
      name: "Playwright New Category",
      categoryGroupId: "group-9",
    });

    expect(result).toContain("ERROR: creating category:");
    expect(result).toContain("group-9");
    expect(result).toContain("wrong-budget");
    expect(createCategoryViaCurrentYnabSdk).not.toHaveBeenCalled();
  });

  it("create_category explains when YNAB rejects a verified category group", async () => {
    (getCategoryGroups as any).mockResolvedValue([
      {
        id: "group-4",
        name: "Verified Group",
        deleted: false,
        categories: [],
      },
    ]);
    (createCategoryViaCurrentYnabSdk as any).mockRejectedValueOnce(
      new Error("YNAB API 400: category_group_id does not exist in this budget")
    );

    const tool = new CreateCategoryTool();
    const result = await tool.execute({
      budgetId: "test-budget",
      name: "Playwright New Category",
      categoryGroupId: "group-4",
    });

    expect(result).toContain("ERROR: creating category:");
    expect(result).toContain("YNAB rejected verified category group");
    expect(result).toContain("Verified Group");
    expect(result).toContain("group-4");
    expect(result).toContain("No category was created");
  });

  it("update_category_group sends a patch request and returns the updated group", async () => {
    (requestYnabApi as any).mockResolvedValue({
      data: {
        category_group: {
          id: "group-2",
          name: "Updated Group",
        },
      },
    });

    const tool = new UpdateCategoryGroupTool();
    const result = parseJsonResult(
      await tool.execute({
        categoryGroupId: "group-2",
        name: "Updated Group",
      })
    );

    expect(result.category_group_id).toBe("group-2");
    expect(result.name).toBe("Updated Group");
  });

  it("update_category patches the category and returns the updated shape", async () => {
    (requestYnabApi as any).mockResolvedValue({
      data: {
        category: {
          id: "cat-9",
          name: "Moved Category",
          note: "Updated note",
          category_group_id: "group-9",
        },
      },
    });

    const tool = new UpdateCategoryTool();
    const result = parseJsonResult(
      await tool.execute({
        categoryId: "cat-9",
        name: "Moved Category",
        note: "Updated note",
        categoryGroupId: "group-9",
      })
    );

    expect(result.category_id).toBe("cat-9");
    expect(result.category_group_id).toBe("group-9");
    expect(result.note).toBe("Updated note");
  });
});
