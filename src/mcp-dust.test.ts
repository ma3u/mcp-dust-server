// test/mcp-dust.test.ts
import { McpClient } from "@modelcontextprotocol/sdk/client/mcp.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { z } from 'zod';
import * as dotenv from 'dotenv';
import { setTimeout } from 'node:timers/promises';

dotenv.config();

// Test configuration
const TEST_CONFIG = {
  maxRetries: 3,
  retryDelay: 1000,
  testMessage: "Explain quantum computing basics",
  invalidMessage: ""
};

// Response validation schemas
const SuccessResponseSchema = z.object({
  content: z.array(z.object({
    type: z.literal("structured"),
    data: z.object({
      conversationId: z.string().length(20),
      messageId: z.string().length(20),
      timestamp: z.string().datetime()
    }),
    text: z.string()
  }))
});

const ErrorResponseSchema = z.object({
  content: z.array(z.object({
    type: z.literal("text"),
    text: z.string(),
    metadata: z.object({
      code: z.string().optional(),
      severity: z.string().optional()
    }).optional()
  })),
  isError: z.boolean().optional()
});

async function testMcpConnection() {
  const client = new McpClient();
  const transport = new StdioClientTransport();

  try {
    // Connection sequence
    await client.connect(transport);
    console.log("🔌 Connected to MCP server");

    // Test valid query
    console.log("🚀 Sending valid query...");
    const validResponse = await client.callTool("dust-query", {
      query: TEST_CONFIG.testMessage
    });

    const validResult = SuccessResponseSchema.safeParse(validResponse);
    if (validResult.success) {
      console.log("✅ Valid query test passed");
      console.log("📦 Response payload:", validResult.data);
    } else {
      console.error("❌ Valid query test failed:", validResult.error);
    }

    // Test invalid query
    console.log("🚨 Sending invalid query...");
    const invalidResponse = await client.callTool("dust-query", {
      query: TEST_CONFIG.invalidMessage
    });

    const invalidResult = ErrorResponseSchema.safeParse(invalidResponse);
    if (invalidResult.success && invalidResponse.isError) {
      console.log("✅ Invalid query test passed");
      console.log("📦 Error response:", invalidResult.data);
    } else {
      console.error("❌ Invalid query test failed");
    }

  } catch (error) {
    console.error("💥 Connection failed:", error instanceof Error ? error.message : error);
  } finally {
    await transport.disconnect();
  }
}

async function runTests() {
  for (let attempt = 1; attempt <= TEST_CONFIG.maxRetries; attempt++) {
    try {
      console.log(`🔁 Test attempt ${attempt}/${TEST_CONFIG.maxRetries}`);
      await testMcpConnection();
      break;
    } catch (error) {
      if (attempt === TEST_CONFIG.maxRetries) {
        console.error("❌ All test attempts failed");
        process.exit(1);
      }
      await setTimeout(TEST_CONFIG.retryDelay);
    }
  }
}

runTests();
