import { MCPServer } from "mcp-framework";
import path from "path";
import { fileURLToPath } from "url";
import { existsSync, mkdirSync } from "fs";
import { createEnabledTools, isMcpWriteEnabled } from "./toolRegistry.js";

// Ensure we are in the project root
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
process.chdir(projectRoot);

const LOG_LEVELS: Record<string, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 50,
};

const configuredLogLevel = (process.env.MCP_RUNTIME_LOG_LEVEL || "warn").toLowerCase();
const activeLogLevel = LOG_LEVELS[configuredLogLevel] ?? LOG_LEVELS.warn;
const verboseToolDumps = process.env.MCP_VERBOSE_TOOL_DUMPS === "true";
const maxLogChars = Number.parseInt(process.env.MCP_MAX_LOG_CHARS || "1200", 10);
const stderrLog = console.error.bind(console);
const originalStderrWrite = process.stderr.write.bind(process.stderr);

function shouldLog(level: keyof typeof LOG_LEVELS): boolean {
  return LOG_LEVELS[level] >= activeLogLevel;
}

function serializeArg(arg: unknown): string {
  if (typeof arg === "string") return arg;
  try { return JSON.stringify(arg); } catch { return String(arg); }
}

function truncate(text: string): string {
  if (text.length <= maxLogChars) return text;
  return `${text.slice(0, maxLogChars)}...[truncated]`;
}

function isToolDumpPayload(payload: string): boolean {
  return /(tool definition|tools":\s*\[|inputSchema|outputSchema|register.*tool)/i.test(payload);
}

function shouldDropStderrLine(text: string): boolean {
  const match = text.match(/^\[[^\]]+\]\s+\[(DEBUG|INFO|WARN|ERROR)\]\s+/i);
  if (match) {
    const level = match[1].toLowerCase() as keyof typeof LOG_LEVELS;
    if (!shouldLog(level)) return true;
  }
  if (!verboseToolDumps && text.length > 300 && isToolDumpPayload(text)) return true;
  return false;
}

function writeStderr(level: keyof typeof LOG_LEVELS, args: unknown[]) {
  if (!shouldLog(level)) return;
  const serialized = args.map((arg) => truncate(serializeArg(arg)));
  const joined = serialized.join(" ");
  if (!verboseToolDumps && joined.length > 300 && isToolDumpPayload(joined)) return;
  stderrLog(...serialized);
}

process.stderr.write = ((chunk: unknown, encoding?: unknown, callback?: unknown) => {
  const text = typeof chunk === "string" ? chunk : Buffer.isBuffer(chunk) ? chunk.toString(encoding as BufferEncoding || "utf8") : String(chunk ?? "");
  if (shouldDropStderrLine(text)) {
    if (typeof encoding === "function") encoding();
    if (typeof callback === "function") callback();
    return true;
  }
  return originalStderrWrite(chunk as never, encoding as never, callback as never);
}) as typeof process.stderr.write;

console.log = (...args: unknown[]) => writeStderr("info", args);
console.info = (...args: unknown[]) => writeStderr("info", args);
console.debug = (...args: unknown[]) => writeStderr("debug", args);
console.warn = (...args: unknown[]) => writeStderr("warn", args);
console.error = (...args: unknown[]) => writeStderr("error", args);

if (!existsSync("logs")) { mkdirSync("logs"); }

const server = new MCPServer();

// --- Explicit tool registration ---
(server as any)._explicitTools = [];
(server as any).registerTool = function(tool: any) { this._explicitTools.push(tool); };
(server as any).toolLoader.loadTools = async function() {
  return [...(server as any)._explicitTools];
};

const enabledTools = createEnabledTools();
enabledTools.forEach(tool => (server as any).registerTool(tool));

console.info(
  `[YNAB MCP Server] Registered ${enabledTools.length} tools (writes ${
    isMcpWriteEnabled() ? "enabled" : "disabled"
  }).`
);

server.start();
process.on("SIGINT", async () => { await server.stop(); });
