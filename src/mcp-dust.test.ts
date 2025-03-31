// src/mcp-dust.test.ts
import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
// Not importing Transport as it's causing module resolution issues
// Instead, we'll implement the transport interface with the required methods
import { z } from 'zod';
import * as dotenv from 'dotenv';
import { setTimeout } from 'node:timers/promises';
import * as readline from 'readline';
import { test } from 'node:test';

dotenv.config();

// Test configuration
const TEST_CONFIG = {
  maxRetries: 3,
  retryDelay: 1000,
  testMessage: "Explain systems thinking, cognitive neuroscience, and problem-solving strategies.",
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

// Custom transport implementation to connect to the running server via HTTP
// Implements the Transport interface methods without the 'implements' clause
class HttpTransport {
  private baseUrl: string;
  private isStarted: boolean = false;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async start(): Promise<void> {
    console.log(`Connecting to MCP server at ${this.baseUrl}`);
    this.isStarted = true;
  }

  async send(message: any): Promise<void> {
    if (!this.isStarted) {
      throw new Error('Transport not started. Call start() first');
    }
    
    try {
      const response = await fetch(`${this.baseUrl}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      this.onMessage?.(data);
    } catch (error) {
      console.error('Transport error:', error);
      this.onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  }

  onMessage?: (message: any) => void;
  onError?: (error: Error) => void;

  async close(): Promise<void> {
    // No persistent connection to close with HTTP
    console.log('HTTP transport closed');
    this.isStarted = false;
  }
}

async function testMcpConnection() {
  // Get MCP configuration from environment variables
  const mcpHost = process.env.MCP_HOST || '127.0.0.1';
  const mcpPort = parseInt(process.env.MCP_PORT || '5001', 10);
  
  const client = new McpClient({
    name: "mcp-dust-client",
    version: "1.0.0",
    requestTimeout: 30000 // 30 seconds timeout to match server config
  });
  
  // Create a custom transport to communicate with the running server
  console.log(`Connecting to MCP server at ${mcpHost}:${mcpPort}`);
  const transport = new HttpTransport(`http://${mcpHost}:${mcpPort}`);

  try {
    // Connection sequence
    await client.connect(transport);
    console.log("🔌 Connected to MCP server");

    // Test valid query
    console.log("🚀 Sending valid query...");
    const validResponse = await client.callTool({
      name: "dust-query", 
      arguments: {
        query: TEST_CONFIG.testMessage
      }
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
    const invalidResponse = await client.callTool({
      name: "dust-query", 
      arguments: {
        query: TEST_CONFIG.invalidMessage
      }
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
    // Close the connection via transport
    transport.close();
  }
}

// Run test with Node.js test runner
test('MCP Dust Server Tools', async () => {
  for (let attempt = 1; attempt <= TEST_CONFIG.maxRetries; attempt++) {
    try {
      console.log(`🔁 Test attempt ${attempt}/${TEST_CONFIG.maxRetries}`);
      await testMcpConnection();
      break;
    } catch (error) {
      console.error(`Error in attempt ${attempt}:`, error);
      if (attempt === TEST_CONFIG.maxRetries) {
        throw new Error("All test attempts failed");
      }
      await setTimeout(TEST_CONFIG.retryDelay);
    }
  }
});
