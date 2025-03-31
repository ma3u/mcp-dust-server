#!/usr/bin/env ts-node
import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { z } from 'zod';
import * as http from 'http';
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

// Create a custom HTTP transport to connect to the already running server
class HttpTransport implements Transport {
  private baseUrl: string;
  private isStarted: boolean = false;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  onMessage?: (message: any) => void;
  onError?: (error: Error) => void;

  async start(): Promise<void> {
    console.log(`\n🔗 Connecting to existing server at ${this.baseUrl}\n`);
    this.isStarted = true;
    // A real implementation might establish a WebSocket connection here
    // For HTTP, we don't need to do anything until sending the first message
  }

  async send(message: any): Promise<void> {
    if (!this.isStarted) {
      throw new Error('Transport not started');
    }

    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      });

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      if (this.onMessage) {
        this.onMessage(data);
      }
    } catch (error) {
      if (this.onError) {
        this.onError(error instanceof Error ? error : new Error(String(error)));
      }
    }
  }

  async close(): Promise<void> {
    // No persistent connection to close with HTTP
    console.log('HTTP transport closed');
    this.isStarted = false;
  }
}

// Get MCP server configuration from .env
const mcpHost = process.env.MCP_HOST || '127.0.0.1';
const mcpPort = parseInt(process.env.MCP_PORT || '5001', 10);
const mcpTimeout = parseInt(process.env.MCP_TIMEOUT || '30', 10) * 1000; // Convert to ms

// Create a transport that connects to your already running server
console.log(`\n🚨 NOTE: This test will connect to your MCP server at ${mcpHost}:${mcpPort}\n`);
console.log("👉 Make sure your server is running with 'npx ts-node src/server.ts'\n");

const transport = new HttpTransport(`http://${mcpHost}:${mcpPort}`);

async function main() {
  try {
    console.log("📡 Starting connection to your already running server\n");
    // Connect to the running server
    await client.connect(transport);
    console.log("✅ Connected to your running MCP server");

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
    console.log("\n💡 You should now see the requests and responses in your server terminal");
    console.log("   where you're running 'npx ts-node src/server.ts'\n");
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
