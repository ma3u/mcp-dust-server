// src/server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { DustAPI } from "@dust-tt/client";
import { z } from "zod";
import * as dotenv from 'dotenv';
dotenv.config();

// Initialize Dust API client
const dustAPI = new DustAPI(
  { url: process.env.DUST_DOMAIN || "https://dust.tt" },
  { 
    workspaceId: process.env.DUST_WORKSPACE_ID || "",
    apiKey: process.env.DUST_API_KEY || ""
  },
  console
);

// Define user context for conversations
const userContext = {
  timezone: process.env.DUST_TIMEZONE || "UTC",
  username: process.env.DUST_USERNAME || "user",
  email: process.env.DUST_EMAIL || "user@example.com",
  fullName: process.env.DUST_FULLNAME || "User",
  origin: "mcp-server" // Identifies requests coming from this MCP server
};

// Create an MCP server with request and response logging
const server = new McpServer({ 
  name: process.env.MCP_NAME || "Dust MCP Bridge", 
  version: "1.0.0",
  onRequest: (request: any) => {
    console.log("\n🔵 MCP REQUEST:", JSON.stringify(request, null, 2));
  },
  onResponse: (response: any) => {
    console.log("\n🟢 MCP RESPONSE:", JSON.stringify(response, null, 2));
  },
  onError: (error: Error) => {
    console.error("\n🔴 MCP ERROR:", error.message);
    console.error(error.stack);
  }
});

// Add a simple echo tool to verify server functionality
server.tool("echo", "Echoes back the provided message", {
  message: z.string().describe("Message to echo back")
}, async (args) => {
  console.log(`Received message: ${args.message}`);
  return { content: [{ type: "text", text: `Echo: ${args.message}` }] };
});

// Add a tool to query the Dust AI agent
server.tool("dust-query", "Send a query to your Dust AI agent", {
  query: z.string().describe("Your question or request for the AI agent")
}, async (args) => {
  console.log(`Sending query to Dust agent: ${args.query}`);
  
  try {
    // Create a conversation with the Dust agent
    const result = await dustAPI.createConversation({
      title: "MCP Bridge Query",
      visibility: "unlisted",
      message: {
        content: args.query,
        mentions: [
          { configurationId: process.env.DUST_AGENT_ID || "" }
        ],
        context: {
          timezone: process.env.DUST_TIMEZONE || "UTC",
          username: process.env.DUST_USERNAME || "",
          email: process.env.DUST_EMAIL || "",
          fullName: process.env.DUST_FULLNAME || "",
          origin: "api"
        }
      }
    });

    // Handle the Result pattern
    if (result.isErr()) {
      const errorMessage = result.error?.message || "Unknown error";
      console.error(`Error creating conversation: ${errorMessage}`);
      return { content: [{ type: "text", text: `Error: ${errorMessage}` }] };
    }

    // Get conversation and message details
    const { conversation, message } = result.value;
    console.log(`Created conversation: ${conversation.sId}, message: ${message.sId}`);
    
    // Stream the agent's response
    const streamResult = await dustAPI.streamAgentAnswerEvents({
      conversation,
      userMessageId: message.sId,
    });
    
    if (streamResult.isErr()) {
      const errorMessage = streamResult.error?.message || "Unknown error";
      console.error(`Error streaming response: ${errorMessage}`);
      return { content: [{ type: "text", text: `Error streaming response: ${errorMessage}` }] };
    }
    
    // Process the streamed response
    const { eventStream } = streamResult.value;
    let answer = "";
    let chainOfThought = "";
    
    try {
      for await (const event of eventStream) {
        if (!event) continue;
        
        switch (event.type) {
          case "user_message_error":
            console.error(`User message error: ${event.error?.message || "Unknown error"}`);
            return { content: [{ type: "text", text: `User message error: ${event.error?.message || "Unknown error"}` }] };
            
          case "agent_error":
            console.error(`Agent error: ${event.error?.message || "Unknown error"}`);
            return { content: [{ type: "text", text: `Agent error: ${event.error?.message || "Unknown error"}` }] };
            
          case "generation_tokens":
            if (event.classification === "tokens") {
              answer = (answer + event.text).trim();
            } else if (event.classification === "chain_of_thought") {
              chainOfThought += event.text;
            }
            break;
            
          case "agent_message_success":
            answer = event.message?.content || answer;
            break;
            
          default:
            // Ignore other event types
        }
      }
      
      if (answer) {
        return { content: [{ type: "text", text: answer }] };
      } else {
        return { content: [{ type: "text", text: "No response from agent" }] };
      }
      
    } catch (streamError) {
      console.error("Error processing stream:", streamError);
      return { 
        content: [{ 
          type: "text", 
          text: `Error processing agent response: ${streamError instanceof Error ? streamError.message : String(streamError)}` 
        }] 
      };
    }
    
  } catch (error) {
    console.error("Exception communicating with Dust:", error);
    return { 
      content: [{ 
        type: "text", 
        text: `Error querying Dust agent: ${error instanceof Error ? error.message : String(error)}` 
      }] 
    };
  }
});

// Start the server
async function main() {
  try {
    // Use MCP configuration from .env
    const host = process.env.MCP_HOST || '127.0.0.1';
    const port = parseInt(process.env.MCP_PORT || '5001', 10);
    const timeout = parseInt(process.env.MCP_TIMEOUT || '30', 10) * 1000; // Convert to ms
    
    // Use StdioServerTransport for direct CLI usage
    const transport = new StdioServerTransport();
    await server.connect(transport);
    
    console.log("MCP Server running...");
    console.log(`Server name: ${process.env.MCP_NAME || "Dust MCP Bridge"}`);
    console.log(`Server host: ${host}:${port} (timeout: ${timeout/1000}s)`);
    console.log(`Dust workspace: ${process.env.DUST_WORKSPACE_ID || "(not configured)"}`);
    console.log(`Dust agent: ${process.env.DUST_AGENT_ID || "(not configured)"}`);
  } catch (error) {
    console.error("Failed to start server:", error);
  }
}

main().catch(console.error);
