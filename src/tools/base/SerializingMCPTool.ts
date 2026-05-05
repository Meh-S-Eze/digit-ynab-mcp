/**
 * SerializingMCPTool - Framework-Safe Response Serialization
 *
 * Drop-in replacement for MCPTool that handles serialization of structured responses.
 *
 * File: src/tools/base/SerializingMCPTool.ts
 *
 * Why this exists:
 * - MCP framework expects tools to return strings
 * - Your tools return structured objects: { success: true, id: "...", data: {} }
 * - This class automatically converts objects → JSON strings
 * - No framework modifications needed (framework-safe!)
 *
 * Usage:
 * 1. Extend this class instead of MCPTool
 * 2. Implement executeInternal() instead of execute()
 * 3. Return whatever you want (object, string, number, null, etc.)
 * 4. Serialization happens automatically
 */

import { MCPTool, ToolResponse } from "mcp-framework";
import { createRequire } from "module";
import { z } from "zod";

const require = createRequire(import.meta.url);
const { zodToJsonSchema } = require("zod-to-json-schema") as {
  zodToJsonSchema: (schema: unknown, options?: Record<string, unknown>) => Record<string, any>;
};

export function handleToolError(error: unknown, context?: string): string {
  let rawMessage =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : String(error ?? "Unknown error");

  rawMessage = rawMessage.trim();
  rawMessage = rawMessage.replace(/^ERROR:\s*/i, "");
  rawMessage = rawMessage.replace(/^Error:\s*/i, "");
  rawMessage = rawMessage.replace(/^Error\s+/i, "");

  if (context) {
    return `ERROR: ${context}: ${rawMessage}`;
  }

  return `ERROR: ${rawMessage}`;
}

function isErrorLikeString(message: string): boolean {
  return /^(ERROR:|Error\b|Authentication failed\b|YNAB API Token is not set\b|No budget ID provided\b|Budget ID is required\b|Transaction ID is required\b|Transactions array is required\b|At least (?:one|\d+)\b|Amount must\b|Source and destination\b|Source account\b|Destination account\b|Cannot transfer\b|Subtransaction amounts\b)/i.test(
    message.trim()
  );
}

/**
 * Base class for all YNAB MCP tools with automatic response serialization.
 *
 * Subclasses should implement executeInternal() instead of execute().
 * The execute() method is sealed and handles serialization automatically.
 *
 * @template Input - The input schema type for this tool
 *
 * @example
 * ```typescript
 * class MyTool extends SerializingMCPTool {
 *   name = "my_tool";
 *   description = "Does something";
 *   schema = z.object({ name: z.string().describe("Name") });
 *
 *   // Implement this instead of execute()
 *   protected async executeInternal(input: { name: string }) {
 *     // Can return objects, strings, anything!
 *     return {
 *       success: true,
 *       result: `Hello ${input.name}`,
 *       timestamp: new Date().toISOString()
 *     };
 *   }
 * }
 * ```
 */
export abstract class SerializingMCPTool<Input extends Record<string, any> = {}> extends MCPTool<Input> {
  // Override schema to allow both old format (wrapper object) and new format (Zod chaining)
  // @ts-ignore - Intentionally overriding base type to be more flexible
  abstract schema: any;

  /**
   * Final execute() method - sealed to ensure serialization always happens.
   *
   * DO NOT OVERRIDE THIS METHOD in subclasses.
   * Instead, implement executeInternal() with your tool logic.
   *
   * This method:
   * 1. Calls executeInternal() with the input
   * 2. Takes whatever is returned
   * 3. Serializes it to a string using serializeResponse()
   * 4. Returns the string (what framework expects)
   *
   * @param input - The validated input from the tool schema
   * @returns Promise<string> - Serialized response
   * @final - Should not be overridden
   */
  async execute(input: Input): Promise<string> {
    try {
      const result = await this.executeInternal(input);
      return this.serializeResponse(result);
    } catch (error) {
      return this.serializeError(error);
    }
  }

  // Override inputSchema to support both formats
  get inputSchema() {
    // Check if schema is the old format (object with type/description wrappers)
    // We check if the values have 'type' and 'description' properties
    const isOldFormat =
      this.schema &&
      typeof this.schema === "object" &&
      !(this.schema instanceof z.ZodObject) &&
      Object.values(this.schema).every(
        (val: any) =>
          val && typeof val === "object" && "type" in val && "description" in val
      );

    if (isOldFormat) {
      return super.inputSchema;
    }

    // New format: Zod object or plain object of Zod schemas
    const zodSchema =
      this.schema instanceof z.ZodObject ? this.schema : z.object(this.schema);
    const jsonSchema = zodToJsonSchema(zodSchema, { $refStrategy: "none" }) as Record<string, any>;

    delete jsonSchema.$schema;
    delete jsonSchema.definitions;

    return jsonSchema as { type: "object"; properties?: Record<string, unknown> };
  }

  // Override toolCall to handle validation for both formats
  // We must override this because validateInput is private in the base class
  async toolCall(request: {
    params: { name: string; arguments?: Record<string, unknown> };
  }): Promise<ToolResponse> {
    const toolName = request.params.name;
    const args = request.params.arguments || {};

    console.log(`[SerializingMCPTool] toolCall recognized: "${toolName}" with args keys:`, Object.keys(args));

    try {
      let validatedInput: Input;

      if (!this.schema) {
        console.warn(`[SerializingMCPTool] Tool "${toolName}" has no schema defined. Using empty object.`);
        validatedInput = {} as Input;
      } else {
        // Check if schema is the old format
        const isOldFormat =
          typeof this.schema === "object" &&
          !(this.schema instanceof z.ZodObject) &&
          Object.keys(this.schema).length > 0 &&
          Object.values(this.schema).every(
            (val: any) =>
              val && typeof val === "object" && "type" in val && "description" in val
          );

        let zodSchema: z.ZodObject<any>;

        if (isOldFormat) {
          zodSchema = z.object(
            Object.fromEntries(
              Object.entries(this.schema).map(([key, schema]: [string, any]) => [
                key,
                schema.type,
              ])
            )
          );
        } else {
          zodSchema =
            this.schema instanceof z.ZodObject
              ? this.schema
              : z.object(this.schema);
        }

        if (!zodSchema || typeof zodSchema.parse !== 'function') {
           throw new Error(`Failed to initialize Zod schema for tool "${toolName}".`);
        }

        validatedInput = zodSchema.parse(args) as Input;
      }

      const result = await this.execute(validatedInput);
      return this.createSuccessResponse(result);
    } catch (error: any) {
      console.error(`[SerializingMCPTool] toolCall failed for "${toolName}":`, error.message);
      return this.createErrorResponse(error);
    }
  }

  protected createSuccessResponse(result: string): ToolResponse {
    return {
      content: [{ type: "text", text: result }]
    } as any;
  }

  protected createErrorResponse(error: any): ToolResponse {
    return {
      content: [{ type: "text", text: handleToolError(error) }],
      isError: true
    } as any;
  }





  /**
   * Implement your tool logic in this method.
   *
   * Override this in subclasses instead of execute().
   *
   * You can return:
   * - Objects: { success: true, data: {...} }
   * - Strings: "Operation completed"
   * - Numbers: 42
   * - Arrays: [1, 2, 3]
   * - null/undefined: null
   * - Anything serializable to JSON
   *
   * Serialization happens automatically in execute().
   *
   * @param input - The validated input from your tool schema
   * @returns Any serializable value (will be converted to string)
   * @abstract
   */
  protected abstract executeInternal(input: Input): Promise<any>;

  /**
   * Converts any response type to string format for MCP framework.
   *
   * This is called automatically after executeInternal().
   * Can be overridden in subclasses for custom serialization.
   *
   * Default behavior:
   * - string → returned as-is
   * - object/array → JSON.stringify (pretty-printed)
   * - null/undefined → JSON representation
   * - other types → String(value)
   *
   * @param result - Any value returned from executeInternal()
   * @returns string - Serialized response
   * @protected - Override in subclasses for custom behavior
   *
   * @example
   * ```typescript
   * class CustomSerializationTool extends SerializingMCPTool {
   *   protected serializeResponse(result: any): string {
   *     // Custom: convert to markdown
   *     if (result.type === 'analysis') {
   *       return `## Analysis Results\n\n${result.summary}`;
   *     }
   *     // Fallback to default
   *     return super.serializeResponse(result);
   *   }
   * }
   * ```
   */
  protected serializeResponse(result: any): string {
    // Already a string - return as-is
    if (typeof result === "string") {
      if (isErrorLikeString(result)) {
        return handleToolError(result);
      }
      return result;
    }

    // Handle null/undefined
    if (result === null || result === undefined) {
      return JSON.stringify({
        success: true,
        message: "Operation completed successfully"
      });
    }

    // Handle objects/arrays - pretty print
    if (typeof result === "object") {
      return JSON.stringify(result, null, 2);
    }

    // Handle numbers, booleans, etc.
    return String(result);
  }

  /**
   * Handles errors from executeInternal().
   *
   * Can be overridden in subclasses for custom error formatting.
   *
   * Default behavior:
   * - Error objects → { success: false, error: message }
   * - Other types → JSON stringified
   *
   * @param error - Any error thrown in executeInternal()
   * @returns string - Serialized error response
   * @protected - Override in subclasses for custom behavior
   *
   * @example
   * ```typescript
   * class CustomErrorHandlingTool extends SerializingMCPTool {
   *   protected serializeError(error: any): string {
   *     // Log errors to your system
   *     console.error('Tool error:', error);
   *
   *     // Return user-friendly message
   *     return JSON.stringify({
   *       success: false,
   *       error: error.message || 'An error occurred',
   *       errorCode: error.code || 'UNKNOWN_ERROR'
   *     });
   *   }
   * }
   * ```
   */
  protected serializeError(error: any): string {
    return handleToolError(error);
  }
}

/**
 * MIGRATION GUIDE - Converting existing tools
 *
 * If you have a tool like this:
 *
 * ```typescript
 * class ApproveTransactionTool extends MCPTool {
 *   name = "approve_transaction";
 *   description = "Approves a transaction";
 *   schema = ApproveSchema;
 *
 *   async execute(input: Input) {
 *     // ...logic...
 *     return { success: true, id: "txn-123" };
 *   }
 * }
 * ```
 *
 * Convert to this:
 *
 * ```typescript
 * class ApproveTransactionTool extends SerializingMCPTool {
 *   name = "approve_transaction";
 *   description = "Approves a transaction";
 *   schema = ApproveSchema;
 *
 *   // Only change: execute → executeInternal
 *   protected async executeInternal(input: Input) {
 *     // ...logic (unchanged)...
 *     return { success: true, id: "txn-123" };  // ✅ Works!
 *   }
 * }
 * ```
 *
 * That's it! 3 changes:
 * 1. extends MCPTool → extends SerializingMCPTool
 * 2. async execute → protected async executeInternal
 * 3. Everything else stays the same
 *
 * TESTING:
 * ```bash
 * npm run build
 * ```
 *
 * If tools compiled before, they'll compile now.
 * Framework will handle serialization automatically.
 */
