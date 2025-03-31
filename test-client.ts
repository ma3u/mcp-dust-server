#!/usr/bin/env ts-node
import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { z } from 'zod';
import * as dotenv from 'dotenv';

dotenv.config();

// Test configuration
const TEST_CONFIG = {
  testMessage: "Explain quantum computing basics",
  invalidMessage: ""
};

// Create a client with increased timeout for AI responses
const client = new McpClient({
  name: "mcp-dust-client",
  version: "1.0.0",
  requestTimeout: 120000 // 2 minutes timeout for AI responses
});

// Create a transport that will spawn a process to connect to
// Use the correct paths based on the system environment
const transport = new StdioClientTransport({
  command: "/opt/homebrew/bin/node",
  args: ["/opt/homebrew/bin/npx", "ts-node", "src/server.ts"]
});

async function main() {
  try {
    // Connect to the running server
    await client.connect(transport);
    console.log("✅ Connected to MCP server");

    // Test the echo tool
    console.log("🔄 Testing echo tool...");
    const echoResponse = await client.callTool({
      name: "echo",
      arguments: {
        message: "Hello MCP!"
      }
    });
    console.log("📤 Echo response:", JSON.stringify(echoResponse, null, 2));

    // Test the Dust query tool
    console.log("\n🚀 Testing dust-query tool...");
    console.log("📤 Query:", TEST_CONFIG.testMessage);
    
    console.log("⏳ Waiting for response (may take up to 2 minutes)...");
    const queryResponse = await client.callTool({
      name: "dust-query",
      arguments: {
        query: TEST_CONFIG.testMessage
      },
      _meta: {
        requestTimeout: 120000 // 2 minutes timeout specifically for this request
      }
    });
    
    console.log("📥 Response:", JSON.stringify(queryResponse, null, 2));
    
    console.log("\n✅ Tests completed successfully");
  } catch (error) {
    console.error("❌ Test failed:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  } finally {
    // Clean up
    process.exit(0);
  }
}

main().catch(error => {
  console.error("💥 Unhandled error:", error);
  process.exit(1);
});
