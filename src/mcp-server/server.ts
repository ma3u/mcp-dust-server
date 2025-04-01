// src/mcp-server/server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import crypto from 'crypto';
import { z } from "zod";
import * as dotenv from 'dotenv';
import { dustClient, DustClient } from "../api/dust-client.js";
import { logger } from "../utils/secure-logger.js";
import { sessionManager } from "../utils/session-manager.js";
import http from 'http';
import express from 'express';
import path from 'path';

// Load environment variables
dotenv.config();

// Create an MCP server with secure request and response logging
export const createMcpServer = () => {
  const mcpServer = new McpServer({ 
    name: process.env.MCP_NAME || "Dust MCP Bridge", 
    version: "1.0.0",
    onRequest: (request: any) => {
      logger.logRequest(request);
    },
    onResponse: (response: any) => {
      logger.logResponse(response);
    },
    onError: (error: Error) => {
      logger.error("MCP ERROR:", error.message, error.stack);
    }
  });

  // Register the echo tool for testing
  mcpServer.tool("echo", "Echoes back the provided message", {
    message: z.string().describe("Message to echo back")
  }, async (args) => {
    logger.info(`Received echo message: ${args.message}`);
    
    // Create a new session for this conversation
    const session = sessionManager.createSession({
      toolName: "echo",
      message: args.message,
      timestamp: new Date()
    });
    
    return { content: [{ type: "text", text: `Echo: ${args.message} (Session ID: ${session.id})` }] };
  });

  // Query Dust AI agent
  mcpServer.tool("dust-query", "Send a query to your Dust AI agent", {
    query: z.string().describe("Your question or request for the AI agent")
  }, async (args) => {
    logger.info(`Sending query to Dust agent: ${args.query}`);
    
    try {
      // Get dust client instance
      const dustClientInstance = DustClient.getInstance();
      const client = dustClientInstance.getClient();
      const userContext = dustClientInstance.getUserContext();
      
      // Create a session for this conversation
      const session = sessionManager.createSession({
        toolName: "dust-query",
        query: args.query,
        timestamp: new Date()
      });
      
      // Create a conversation with the Dust agent
      const result = await client.createConversation({
        title: "MCP Bridge Query",
        visibility: "unlisted",
        message: {
          content: args.query,
          mentions: [
            { configurationId: dustClient.getAgentId() }
          ],
          context: userContext
        }
      });

      // Handle the Result pattern
      if (result.isErr()) {
        const errorMessage = result.error?.message || "Unknown error";
        logger.error(`Error creating conversation: ${errorMessage}`);
        return { content: [{ type: "text", text: `Error: ${errorMessage}` }] };
      }

      // Get conversation and message details
      const { conversation, message } = result.value;
      logger.info(`Created conversation: ${conversation.sId}, message: ${message.sId}`);
      
      // Update session with conversation data
      sessionManager.updateSession(session.id, {
        conversationId: conversation.sId,
        messageId: message.sId
      });
      
      // Stream the agent's response
      const streamResult = await client.streamAgentAnswerEvents({
        conversation,
        userMessageId: message.sId,
      });
      
      if (streamResult.isErr()) {
        const errorMessage = streamResult.error?.message || "Unknown error";
        logger.error(`Error streaming response: ${errorMessage}`);
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
              logger.error(`User message error: ${event.error?.message || "Unknown error"}`);
              return { content: [{ type: "text", text: `User message error: ${event.error?.message || "Unknown error"}` }] };
              
            case "agent_error":
              logger.error(`Agent error: ${event.error?.message || "Unknown error"}`);
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
        
        // Update session with the answer
        sessionManager.updateSession(session.id, {
          answer,
          chainOfThought: chainOfThought || null,
          completed: true,
          completedAt: new Date()
        });
        
        if (answer) {
          return { content: [{ type: "text", text: answer }] };
        } else {
          return { content: [{ type: "text", text: "No response from agent" }] };
        }
        
      } catch (streamError) {
        logger.error("Error processing stream:", streamError);
        return { 
          content: [{ 
            type: "text", 
            text: `Error processing agent response: ${streamError instanceof Error ? streamError.message : String(streamError)}` 
          }] 
        };
      }
      
    } catch (error) {
      logger.error("Exception communicating with Dust:", error);
      return { 
        content: [{ 
          type: "text", 
          text: `Error querying Dust agent: ${error instanceof Error ? error.message : String(error)}` 
        }] 
      };
    }
  });

  // Add more tools as needed

  return mcpServer;
};

export default createMcpServer;
