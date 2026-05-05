import AnalyzeSpendingTool from "./tools/AnalyzeSpendingTool.js";
import AnalyzeTransactionsTool from "./tools/AnalyzeTransactionsTool.js";
import ApproveTransactionTool from "./tools/ApproveTransactionTool.js";
import BudgetCacheStatusTool from "./tools/BudgetCacheStatusTool.js";
import BudgetSummaryTool from "./tools/BudgetSummaryTool.js";
import ClearTransactionTool from "./tools/ClearTransactionTool.js";
import CreateAccountTool from "./tools/CreateAccountTool.js";
import CreateCategoryGroupTool from "./tools/CreateCategoryGroupTool.js";
import CreateCategoryTool from "./tools/CreateCategoryTool.js";
import CreateMultipleTransactionsTool from "./tools/CreateMultipleTransactionsTool.js";
import CreatePayeeTool from "./tools/CreatePayeeTool.js";
import CreateScheduledTransactionTool from "./tools/CreateScheduledTransactionTool.js";
import CreateSplitTransactionTool from "./tools/CreateSplitTransactionTool.js";
import CreateTransferTool from "./tools/CreateTransferTool.js";
import DeleteScheduledTransactionTool from "./tools/DeleteScheduledTransactionTool.js";
import DeleteTransactionTool from "./tools/DeleteTransactionTool.js";
import GenerateSpendingReportTool from "./tools/GenerateSpendingReportTool.js";
import GetMonthDetailTool from "./tools/GetMonthDetailTool.js";
import GetPayeesTool from "./tools/GetPayeesTool.js";
import GetSinglePayeeTool from "./tools/GetSinglePayeeTool.js";
import GetUnapprovedTransactionsTool from "./tools/GetUnapprovedTransactionsTool.js";
import HealthCheckTool from "./tools/HealthCheckTool.js";
import ListAccountsTool from "./tools/ListAccountsTool.js";
import ListBudgetsTool from "./tools/ListBudgetsTool.js";
import ListCategoryGroupsTool from "./tools/ListCategoryGroupsTool.js";
import ListScheduledTransactionsTool from "./tools/ListScheduledTransactionsTool.js";
import MoveFundsTool from "./tools/MoveFundsTool.js";
import PlanWriteActionTool from "./tools/PlanWriteActionTool.js";
import ReadBudgetCacheTool from "./tools/ReadBudgetCacheTool.js";
import SyncBudgetDeltaTool from "./tools/SyncBudgetDeltaTool.js";
import UpdateCategoryBudgetTool from "./tools/UpdateCategoryBudgetTool.js";
import UpdateCategoryGroupTool from "./tools/UpdateCategoryGroupTool.js";
import UpdateCategoryTool from "./tools/UpdateCategoryTool.js";
import UpdateMultipleTransactionsTool from "./tools/UpdateMultipleTransactionsTool.js";
import UpdateScheduledTransactionTool from "./tools/UpdateScheduledTransactionTool.js";
import UpdateSingleTransactionTool from "./tools/UpdateSingleTransactionTool.js";

export function isMcpWriteEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return /^(1|true|yes|on)$/i.test(env.YNAB_MCP_ENABLE_WRITES || "");
}

export function isMcpCacheReadMode(env: NodeJS.ProcessEnv = process.env): boolean {
  return /^(cache|delta|synced)$/i.test(env.YNAB_MCP_READ_MODE || "");
}

export function createCacheReadTools() {
  return [
    new BudgetCacheStatusTool(),
    new SyncBudgetDeltaTool(),
    new ReadBudgetCacheTool(),
  ];
}

export function createReadOnlyTools() {
  return [
    new AnalyzeSpendingTool(),
    new AnalyzeTransactionsTool(),
    new BudgetSummaryTool(),
    new GenerateSpendingReportTool(),
    new GetMonthDetailTool(),
    new GetPayeesTool(),
    new GetSinglePayeeTool(),
    new GetUnapprovedTransactionsTool(),
    new HealthCheckTool(),
    new ListAccountsTool(),
    new ListBudgetsTool(),
    new ListCategoryGroupsTool(),
    new ListScheduledTransactionsTool(),
  ];
}

export function createWriteTools() {
  return [
    new ApproveTransactionTool(),
    new ClearTransactionTool(),
    new CreateAccountTool(),
    new CreateCategoryGroupTool(),
    new CreateCategoryTool(),
    new CreateMultipleTransactionsTool(),
    new CreatePayeeTool(),
    new CreateScheduledTransactionTool(),
    new CreateSplitTransactionTool(),
    new CreateTransferTool(),
    new DeleteScheduledTransactionTool(),
    new DeleteTransactionTool(),
    new MoveFundsTool(),
    new PlanWriteActionTool(),
    new UpdateCategoryBudgetTool(),
    new UpdateCategoryGroupTool(),
    new UpdateCategoryTool(),
    new UpdateMultipleTransactionsTool(),
    new UpdateScheduledTransactionTool(),
    new UpdateSingleTransactionTool(),
  ];
}

export function createEnabledTools(env: NodeJS.ProcessEnv = process.env) {
  const readOnlyTools = isMcpCacheReadMode(env)
    ? createCacheReadTools()
    : createReadOnlyTools();
  return isMcpWriteEnabled(env)
    ? [...readOnlyTools, ...createWriteTools()]
    : readOnlyTools;
}
