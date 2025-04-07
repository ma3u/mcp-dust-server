/**
 * @fileoverview MCP Server Implementation for Dust API Integration
 * 
 * This file implements a Model Context Protocol (MCP) server that bridges
 * client applications with the Dust AI platform. It handles protocol-compliant
 * communication, request validation, tool registration, and message routing.
 * 
 * The server supports both SSE and HTTP Stream transports as defined in the
 * MCP specification (version 2024-11-05).
 * 
 * @see https://spec.modelcontextprotocol.io/specification/2024-11-05/
 * @see https://github.com/modelcontextprotocol/typescript-sdk
 * @see https://github.com/dust-tt/dust-sdk-js
 * 
 * @author Ma3u
 * @project P4XAI
 * @jira P4XAI-1
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import express from 'express';
import cors from 'cors';
import http from 'http';
import { z } from "zod";
import * as dotenv from 'dotenv';
import { dustClient, DustClient } from "../api/dust-client.js";
import { logger } from "../utils/secure-logger.js";
import { conversationHistory, ConversationMessage } from "../utils/conversation-history.js";
import { validateMessageRequest, validateInitializeRequest, validateTerminateRequest } from "../schemas/context-validation.js";
import crypto from 'crypto';
import bodyParser from "body-parser";

// Load environment variables
dotenv.config();

/**
 * Request tracking infrastructure to manage active requests and their cancellation
 */
interface TrackedRequest {
  abortController: AbortController;
  startTime: number;
  sessionId?: string;
}

const activeRequests = new Map<string, TrackedRequest>();

/**
 * Track a request with its abort controller for timeout and cancellation management
 * @param requestId - The unique ID of the request to track
 * @param abortController - The abort controller for this request
 * @param sessionId - Optional session ID associated with this request
 */
function trackRequest(requestId: string, abortController: AbortController, sessionId?: string): void {
  activeRequests.set(requestId, {
    abortController,
    startTime: Date.now(),
    sessionId
  });
  logger.info(`[${new Date().toISOString()}] Request ${requestId} tracked with abort controller${sessionId ? `, session: ${sessionId}` : ''}`);
  logger.info(`[${new Date().toISOString()}] Total active requests: ${activeRequests.size}`);
}

/**
 * Cancel a tracked request by its ID
 * @param requestId - The ID of the request to cancel
 */
function cancelRequest(requestId: string): void {
  const req = activeRequests.get(requestId);
  if (req) {
    const duration = Math.round((Date.now() - req.startTime) / 1000);
    logger.info(`[${new Date().toISOString()}] Cancelling request ${requestId}, duration: ${duration}s, session: ${req.sessionId || 'undefined'}`);
    req.abortController.abort();
    activeRequests.delete(requestId);
    logger.info(`[${new Date().toISOString()}] Total active requests after cancellation: ${activeRequests.size}`);
  } else {
    logger.warn(`[${new Date().toISOString()}] Attempted to cancel unknown request: ${requestId}`);
  }
}

/**
 * Clean up request tracking for completed requests
 * @param requestId - The ID of the completed request
 */
function completeRequest(requestId: string): void {
  const req = activeRequests.get(requestId);
  if (req) {
    const duration = Math.round((Date.now() - req.startTime) / 1000);
    logger.info(`[${new Date().toISOString()}] Request ${requestId} completed, duration: ${duration}s, session: ${req.sessionId || 'undefined'}`);
    activeRequests.delete(requestId);
    logger.info(`[${new Date().toISOString()}] Total active requests after completion: ${activeRequests.size}`);
  } else {
    logger.warn(`[${new Date().toISOString()}] Attempted to complete unknown request: ${requestId}`);
  }
}

// Default timeout in seconds
const DEFAULT_TIMEOUT = 60;
const MCP_TIMEOUT = parseInt(process.env.MCP_TIMEOUT || DEFAULT_TIMEOUT.toString(), 10);

/**
 * Creates and configures a new MCP server instance with Dust API integration.
 * 
 * This factory function sets up a complete MCP server with:
 * - Request and response logging with PII masking
 * - Protocol-compliant message validation
 * - Conversation history tracking
 * - Custom tool implementations for Dust API
 * - Support for both SSE and HTTP Stream transports
 * - Error handling and graceful degradation
 * 
 * @returns {McpServer} A configured MCP server instance ready to connect to transports
 */
export const createMcpServer = () => {
  // Log server configuration for debugging
  logger.info('Server configuration:', {
    port: process.env.MCP_PORT || 5001,
    dustWorkspace: process.env.DUST_WORKSPACE_ID,
    dustAgent: process.env.DUST_AGENT_ID
  });

  /**
   * Create the core MCP server instance with event handlers
   * @type {McpServer}
   */
  const mcpServer = new McpServer({ 
    name: process.env.MCP_NAME || "Dust MCP Bridge", 
    version: "1.0.0",
    protocolVersion: "2024-11-05",
    /**
     * Request handler for incoming MCP messages
     * Validates requests and maintains conversation history
     * 
     * @param {any} request - The incoming MCP request object
     */
    onRequest: (request: any) => {
      logger.info(`Incoming request: ${JSON.stringify(request, null, 2)}`);
      // Add explicit error handling for all requests
      try {
        // Use non-blocking logging for large requests
        setImmediate(() => {
          logger.logRequest(request);
          logger.debug('Received message:', JSON.stringify(request));
        });
        
        // Validate request based on method
        if (request.method === 'initialize') {
          const validation = validateInitializeRequest(request);
          if (!validation.success) {
            logger.warn(`Invalid initialize request: ${JSON.stringify(validation.error.errors)}`);
          } else {
            logger.info('Initialize validation succeeded');
          }
        } else if (request.method === 'message') {
          const validation = validateMessageRequest(request);
          if (!validation.success) {
            logger.warn(`Invalid message request: ${JSON.stringify(validation.error.errors)}`);
          } else {
            // Add message to conversation history
            const message = request.params.message;
            const sessionId = request.sessionId || 'unknown';
            
            conversationHistory.addMessage({
              id: crypto.randomUUID(),
              sessionId,
              role: message.role,
              content: message.content ? JSON.stringify(message.content) : '',
              timestamp: new Date(),
              toolCalls: message.tool_calls,
              metadata: {
                requestId: request.id
              }
            });
          }
        } else if (request.method === 'terminate') {
          const validation = validateTerminateRequest(request);
          if (!validation.success) {
            logger.warn(`Invalid terminate request: ${JSON.stringify(validation.error.errors)}`);
          } else {
            // Cancel any in-flight requests for this session
            if (request.sessionId) {
              // Find and cancel all requests for this session
              for (const [requestId, reqData] of activeRequests.entries()) {
                if (reqData.sessionId === request.sessionId) {
                  logger.info(`Cancelling request ${requestId} due to session termination`);
                  cancelRequest(requestId);
                }
              }
            }
          }
        }
      } catch (error: any) {
        logger.error(`[${new Date().toISOString()}] Error processing request: ${error.message}`, error.stack || 'No stack trace available');
        logger.error(error.stack);
        throw error; // re-throw the error to ensure the client gets an error response
      }
    },
    onResponse: (response: any) => {
      logger.info(`Sending response: ${JSON.stringify(response, null, 2)}`);
      try {
        // Log response with more details for debugging
        logger.logResponse(response);
        
        // Add assistant responses to conversation history
        if (response.result?.message) {
          const message = response.result.message;
          const sessionId = response.sessionId || 'unknown';
          
          conversationHistory.addMessage({
          id: crypto.randomUUID(),
          sessionId,
          role: message.role,
          content: message.content ? JSON.stringify(message.content) : '',
          timestamp: new Date(),
          toolResults: message.tool_results,
          metadata: {
            responseId: response.id
          }
        });
      }
      } catch (error: any) {
        logger.error('Error in onResponse handler:', error);
        logger.error(`[${new Date().toISOString()}] Error in onResponse handler: ${error.message}`, error.stack || 'No stack trace available');
        logger.error(error.stack);
      }
    },
    onError: (error: Error | string) => {
      if (typeof error === 'string') {
        logger.error(`[${new Date().toISOString()}] MCP ERROR: ${error}`);
      } else {
        const stack = error.stack || 'No stack trace available';
        logger.error(`[${new Date().toISOString()}] MCP ERROR: ${error.message}`, stack);
        logger.error(stack);
      }
    }
  });

  /**
   * Register the echo tool for testing MCP functionality
   * This simple tool echoes back any message sent to it
   */
  mcpServer.tool("echo", { 
    message: z.string().describe("Message to echo back")
  }, async ({ message }, context) => {
    logger.info(`[${new Date().toISOString()}] Received echo message: ${JSON.stringify({ message }, null, 2)}`);
    const sessionId = (context && 'sessionId' in context) ? context.sessionId as string : undefined;
    logger.info(`Session ID for echo request: ${sessionId || 'undefined'}`);
    
    const response = { content: [{ type: "text" as const, text: `Echo: ${message}` }] };
    logger.info(`[${new Date().toISOString()}] Sending echo response: ${JSON.stringify(response, null, 2)}`);
    return response;
  });

  /**
   * Register the dust-query tool for interacting with Dust AI
   * This tool forwards queries to the configured Dust agent and returns responses
   */
  mcpServer.tool("dust-query", {
    query: z.string().describe("Your question or request for the AI agent")
  }, async ({ query }, context) => {
    logger.info(`[${new Date().toISOString()}] Received dust-query request: ${JSON.stringify({ query }, null, 2)}`);
    const requestSessionId = (context && 'sessionId' in context) ? context.sessionId as string : undefined;
    logger.info(`Session ID for dust-query request: ${requestSessionId || 'undefined'}`);
    logger.info(`Sending query to Dust agent: ${query}`);
    
    // Create abort controller for timeout and cancellation
    const controller = new AbortController();
    const signal = controller.signal;
    
    // Set timeout based on configuration
    const timeoutMs = MCP_TIMEOUT * 1000;
    const timeoutId = global.setTimeout(() => {
      logger.warn(`Request timed out after ${MCP_TIMEOUT} seconds`);
      controller.abort(new Error(`Request timed out after ${MCP_TIMEOUT} seconds`));
    }, timeoutMs);
    
    // Track this request for potential cancellation
    const requestId = (context && 'id' in context) ? context.id as string : crypto.randomUUID();
    const sessionId = (context && 'sessionId' in context) ? context.sessionId as string : undefined;
    trackRequest(requestId, controller, sessionId);
    
    try {
      // Get dust client instance
      const dustClientInstance = DustClient.getInstance();
      const client = dustClientInstance.getClient();
      const userContext = dustClientInstance.getUserContext();
      
      // Periodically yield to event loop to prevent blocking
      await new Promise(resolve => setImmediate(resolve));
      
      // Create a conversation with the Dust agent
      const result = await client.createConversation({
        title: "MCP Bridge Query",
        visibility: "unlisted",
        message: {
          content: query,
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
      
      // Yield to event loop again
      await new Promise(resolve => setImmediate(resolve));
      
      // Stream the agent's response with the abort signal
      signal.addEventListener("abort", () => {
        logger.warn("Stream processing aborted: " + signal.reason);
        return { 
          content: [{ 
            type: "text", 
            text: `Request timed out or was cancelled: ${signal.reason}` 
          }] 
        };
      });
      const streamResult = await client.streamAgentAnswerEvents({
        conversation,
        userMessageId: message.sId,
        signal: signal
      });
      
      if (streamResult.isErr()) {
        const errorMessage = streamResult.error?.message || "Unknown error";
        logger.error(`Error streaming response: ${errorMessage}`);
        return { 
          content: [{ 
            type: "text", 
            text: `Error streaming response: ${errorMessage}` 
          }] 
        };
      }
      
      // Process the streamed response
      const { eventStream } = streamResult.value;
      let answer = "";
      let chainOfThought = "";
      
      try {
        // Track last time we yielded to event loop
        let lastYield = Date.now();
        const CHUNK_PROCESSING_LIMIT = 100; // ms
        
        for await (const event of eventStream) {
          // Check if we need to yield to event loop
          if (Date.now() - lastYield > CHUNK_PROCESSING_LIMIT) {
            await new Promise(resolve => setImmediate(resolve));
            lastYield = Date.now();
            
            // Check if operation was aborted
            if (signal.aborted) {
              throw new Error("Operation aborted: " + signal.reason);
            }
          }
          
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
        
        if (answer) {
          const response = { content: [{ type: "text" as const, text: answer }] };
          logger.info(`[${new Date().toISOString()}] Sending dust-query response: ${JSON.stringify(response, null, 2)}`);
          return response;
        } else {
          const response = { content: [{ type: "text" as const, text: "No response from agent" }] };
          logger.info(`[${new Date().toISOString()}] Sending dust-query empty response`);
          return response;
        }
        
      } catch (streamError: any) {
        // Check if this was an abort error
        if (signal.aborted) {
          logger.warn("Stream processing aborted: " + signal.reason);
          return { 
            content: [{ 
              type: "text", 
              text: `Request timed out or was cancelled: ${signal.reason}` 
            }] 
          };
        }
        
        logger.error("Error processing stream:", streamError);
        return { 
          content: [{ 
            type: "text", 
            text: `Error processing agent response: ${streamError instanceof Error ? streamError.message : String(streamError)}` 
          }] 
        };
      }
      
    } catch (error: any) {
      logger.error(`[${new Date().toISOString()}] Error processing request: ${error.message}`, error.stack || 'No stack trace available');
      logger.error(error.stack);
      throw error; // re-throw the error to ensure the client gets an error response
    } finally {
      // Clean up regardless of success or failure
      completeRequest(requestId);
      if (!controller.signal.aborted) {
        controller.abort(); // Ensure controller is aborted
      }
      // Clear the timeout to prevent memory leaks
      clearTimeout(timeoutId);
    }
  });

  /**
   * Override the initialize method handler to ensure proper response
   * This customization ensures initialize requests are handled according to the MCP spec
   * and provides better error handling for protocol compliance
   */
  const originalHandleMessage = (mcpServer as any).handleMessage;
  (mcpServer as any).handleMessage = async function(message: any, transport?: any) {
    logger.debug(`Custom message handler received: ${JSON.stringify(message)}`);
    
    // Special handling for initialize method
    if (message.method === 'initialize') {
      logger.info('Handling initialize method');
      
      try {
        // Validate the initialize request
        const validation = validateInitializeRequest(message);
        if (!validation.success) {
          logger.warn(`Invalid initialize request: ${JSON.stringify(validation.error?.errors)}`);
          const errorResponse = {
            jsonrpc: '2.0',
            error: {
              code: -32602,
              message: 'Invalid params for initialize method'
            },
            id: message.id
          };
          
          // If transport is provided, send the response directly
          if (transport && typeof transport.send === 'function') {
            await transport.send(errorResponse);
          }
          
          return errorResponse;
        }
        
        // Create a properly formatted initialize response according to MCP spec
        const response = {
          jsonrpc: '2.0',
          result: {
            protocolVersion: '2024-11-05',
            serverInfo: {
              name: process.env.MCP_NAME || "Dust MCP Bridge",
              version: '1.0.0'
            },
            capabilities: {}
          },
          id: message.id
        };
        
        // Always send the response immediately to prevent timeout
        logger.info(`Sending initialize response: ${JSON.stringify(response)}`);
        
        // If transport is provided, send the response directly
        if (transport && typeof transport.send === 'function') {
          await transport.send(response);
        } else {
          // If no transport is provided, try to use the internal response mechanism
          logger.warn('No transport provided for initialize response, using fallback');
          // Call the original handler to ensure proper response routing
          return originalHandleMessage.call(this, message, transport);
        }
        
        return response;
      } catch (error: any) {
        logger.error(`[${new Date().toISOString()}] Error processing request: ${error.message}`, error.stack || 'No stack trace available');
        logger.error(error.stack);
        throw error; // re-throw the error to ensure the client gets an error response
      }
    }
    
    // For other methods, use the original handler
    return originalHandleMessage.call(this, message, transport);
  };

  /**
   * Expose the internal connect method to handle direct message processing
   * This customization allows for special handling of initialize messages
   * and better transport management
   */
  const originalConnect = mcpServer.connect.bind(mcpServer);
  mcpServer.connect = async function(transport: any) {
    logger.info(`Connecting transport: ${transport.constructor.name}`);
    
    // Register a direct message handler for the transport
    transport.onMessage = async (message: any) => {
      logger.debug(`Direct message received from transport: ${JSON.stringify(message)}`);
      
      // Process the message through our custom handler
      if (message.method === 'initialize') {
        // For initialize, use our custom handler with the transport
        await (this as any).handleMessage(message, transport);
      } else {
        // For other methods, let the SDK handle it
        await (this as any)._onMessage(message);
      }
    };
    
    // Call the original connect method
    return originalConnect(transport);
  };
  
  /**
   * Create a handler for HTTP Stream messages according to MCP specification
   * This handler processes JSON-RPC messages sent via HTTP POST requests
   * and returns appropriate responses according to the MCP spec
   * 
   * @param {any} message - The JSON-RPC message to process
   * @param {string} sessionId - The session ID associated with the request
   * @returns {Promise<any>} A JSON-RPC response object
   */
  const handleHttpStreamMessage = async (message: any, sessionId: string) => {
    try {
      logger.debug(`Processing HTTP Stream message: ${JSON.stringify(message)}`);
      
      // Ensure session ID is included in the message
      if (sessionId && !message.sessionId) {
        message.sessionId = sessionId;
      }
      
      // Process the message through the MCP server
      // The MCP SDK doesn't expose a direct handleMessage method, so we need to
      // use the internal mechanisms to process the message
      
      // For JSON-RPC requests, we need to validate and process them
      if (message.jsonrpc === '2.0' && message.method && message.id !== undefined) {
        // Validate the message based on its method
        let isValid = true;
        
        if (message.method === 'initialize') {
          const validation = validateInitializeRequest(message);
          isValid = validation.success;
          if (!isValid && 'error' in validation) {
            logger.warn(`Invalid initialize request: ${JSON.stringify(validation.error.errors)}`);
          }
        } else if (message.method === 'message') {
          const validation = validateMessageRequest(message);
          isValid = validation.success;
          if (!isValid && 'error' in validation) {
            logger.warn(`Invalid message request: ${JSON.stringify(validation.error.errors)}`);
          }
        } else if (message.method === 'terminate') {
          const validation = validateTerminateRequest(message);
          isValid = validation.success;
          if (!isValid && 'error' in validation) {
            logger.warn(`Invalid terminate request: ${JSON.stringify(validation.error.errors)}`);
          }
        }
        
        if (!isValid) {
          return {
            jsonrpc: '2.0',
            error: {
              code: -32602,
              message: 'Invalid params'
            },
            id: message.id
          };
        }
        
        // Process the message based on its method
        if (message.method === 'initialize') {
          // Handle initialize request according to MCP spec
          logger.info('HTTP Stream: Handling initialize method');
          return {
            jsonrpc: '2.0',
            result: {
              protocolVersion: '2024-11-05',
              serverInfo: {
                name: process.env.MCP_NAME || "Dust MCP Bridge",
                version: '1.0.0'
              },
              capabilities: {}
            },
            id: message.id
          };
        } else if (message.method === 'run') {
          // Handle run method for direct tool execution
          try {
            // Extract the tool name and arguments
            const { tool, args } = message.params;
            let result;
            
            logger.info(`Received run request for tool: ${tool}`);
            logger.debug(`Tool arguments: ${JSON.stringify(args)}`);
            
            // Handle different tools
            if (tool === 'echo') {
              // Echo tool implementation
              logger.info(`Executing echo tool with message: ${args.message}`);
              result = { message: args.message };
            } else if (tool === 'dust-query') {
              // Dust query implementation
              logger.info(`Executing dust-query tool with query: ${args.query}`);
              
              // Get dust client instance
              const dustClientInstance = DustClient.getInstance();
              const client = dustClientInstance.getClient();
              const userContext = dustClientInstance.getUserContext();
              
              // Create a conversation with the Dust agent
              const dustResult = await client.createConversation({
                title: "MCP Bridge Direct Query",
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
              if (dustResult.isErr()) {
                const errorMessage = dustResult.error?.message || "Unknown error";
                logger.error(`Error creating conversation: ${errorMessage}`);
                throw new Error(errorMessage);
              }

              // Get conversation and message details
              const { conversation, message } = dustResult.value;
              logger.info(`Created conversation: ${conversation.sId}, message: ${message.sId}`);
              
              // Stream the agent's response
              const streamResult = await client.streamAgentAnswerEvents({
                conversation,
                userMessageId: message.sId,
              });
              
              if (streamResult.isErr()) {
                const errorMessage = streamResult.error?.message || "Unknown error";
                logger.error(`Error streaming response: ${errorMessage}`);
                throw new Error(errorMessage);
              }
              
              // Process the streamed response
              const { eventStream } = streamResult.value;
              let answer = "";
              let chainOfThought = "";
              
              try {
                // Track last time we yielded to event loop
                let lastYield = Date.now();
                const CHUNK_PROCESSING_LIMIT = 100; // ms
                
                for await (const event of eventStream) {
                  // Check if we need to yield to event loop
                  if (Date.now() - lastYield > CHUNK_PROCESSING_LIMIT) {
                    await new Promise(resolve => setImmediate(resolve));
                    lastYield = Date.now();
                    
                    // Check if operation was aborted
                    const controller = new AbortController();
                    const signal: AbortSignal = controller.signal;
                    if (signal.aborted) {
                      throw new Error("Operation aborted: " + signal.reason);
                    }
                  }
                  
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
                
                if (answer) {
                  const response = { content: [{ type: "text" as const, text: answer }] };
                  logger.info(`[${new Date().toISOString()}] Sending dust-query response: ${JSON.stringify(response, null, 2)}`);
                  return response;
                } else {
                  const response = { content: [{ type: "text" as const, text: "No response from agent" }] };
                  logger.info(`[${new Date().toISOString()}] Sending dust-query empty response`);
                  return response;
                }
                
              } catch (streamError: any) {
                
                logger.error("Error processing stream:", streamError);
                return { 
                  content: [{ 
                    type: "text", 
                    text: `Error processing agent response: ${streamError instanceof Error ? streamError.message : String(streamError)}` 
                  }] 
                };
              }
              
            } else {
              // Unknown tool
              logger.warn(`Unknown tool requested: ${tool}`);
              return {
                jsonrpc: '2.0',
                error: { 
                  code: -32601, 
                  message: `Unknown tool: ${tool}` 
                },
                id: message.id
              };
            }
            
            // Return the successful result
            return {
              jsonrpc: '2.0',
              result,
              id: message.id
            };
          } catch (error: any) {
            logger.error(`[${new Date().toISOString()}] Error processing request: ${error.message}`, error.stack || 'No stack trace available');
            logger.error(error.stack);
            throw error; // re-throw the error to ensure the client gets an error response
          }
        } else if (message.method === 'message') {
          // Handle message request - this is where tool calls are processed
          try {
            // Extract the tool call if present
            const toolCall = message.params?.message?.tool_calls?.[0];
            
            if (toolCall && toolCall.name) {
              let result;
              
              logger.info(`Received tool call for ${toolCall.name}`);
              logger.debug(`Tool call arguments: ${JSON.stringify(toolCall.parameters)}`);
              
              // Process based on the tool name
              if (toolCall.name === 'echo') {
                // Echo tool implementation
                logger.info(`Executing echo tool with message: ${toolCall.parameters?.message}`);
                result = { content: [{ type: "text", text: `Echo: ${toolCall.parameters?.message}` }] };
              } else if (toolCall.name === 'dust-query') {
                // Dust query implementation
                logger.info(`Executing dust-query tool with query: ${toolCall.parameters?.query}`);
                
                // Get dust client instance
                const dustClientInstance = DustClient.getInstance();
                const client = dustClientInstance.getClient();
                const userContext = dustClientInstance.getUserContext();
                
                // Create a conversation with the Dust agent
                const dustResult = await client.createConversation({
                  title: "MCP Bridge Query",
                  visibility: "unlisted",
                  message: {
                    content: toolCall.parameters?.query,
                    mentions: [
                      { configurationId: dustClient.getAgentId() }
                    ],
                    context: userContext
                  }
                });

                // Handle the Result pattern
                if (dustResult.isErr()) {
                  const errorMessage = dustResult.error?.message || "Unknown error";
                  logger.error(`Error creating conversation: ${errorMessage}`);
                  throw new Error(errorMessage);
                }

                // Get conversation and message details
                const { conversation, message } = dustResult.value;
                logger.info(`Created conversation: ${conversation.sId}, message: ${message.sId}`);
                
                // Stream the agent's response
                const streamResult = await client.streamAgentAnswerEvents({
                  conversation,
                  userMessageId: message.sId,
                });
                
                if (streamResult.isErr()) {
                  const errorMessage = streamResult.error?.message || "Unknown error";
                  logger.error(`Error streaming response: ${errorMessage}`);
                  throw new Error(errorMessage);
                }
                
                // Process the streamed response
                const { eventStream } = streamResult.value;
                let answer = "";
                
                for await (const event of eventStream) {
                  if (!event) continue;
                  
                  if (event.type === "generation_tokens" && event.classification === "tokens") {
                    answer = (answer + event.text).trim();
                  } else if (event.type === "agent_message_success") {
                    answer = event.message?.content || answer;
                  }
                }
                
                result = { content: [{ type: "text", text: answer || "No response from agent" }] };
              } else {
                // Unknown tool
                result = { content: [{ type: "text", text: `Unknown tool: ${toolCall.name}` }] };
              }
              
              // Return the result in the expected format
              return {
                jsonrpc: '2.0',
                result: {
                  message: {
                    role: 'assistant',
                    content: result.content,
                    tool_results: [
                      {
                        tool_call_id: toolCall.id,
                        result: result
                      }
                    ]
                  }
                },
                id: message.id
              };
            } else {
              // No tool call found
              return {
                jsonrpc: '2.0',
                result: {
                  message: {
                    role: 'assistant',
                    content: [{ type: "text", text: "No tool call found in the message" }]
                  }
                },
                id: message.id
              };
            }
          } catch (error: any) {
            logger.error(`[${new Date().toISOString()}] Error processing request: ${error.message}`, error.stack || 'No stack trace available');
            logger.error(error.stack);
            throw error; // re-throw the error to ensure the client gets an error response
          }
        } else if (message.method === 'terminate') {
          // Handle terminate request
          return {
            jsonrpc: '2.0',
            result: {},
            id: message.id
          };
        } else {
          // Unknown method
          return {
            jsonrpc: '2.0',
            error: {
              code: -32601,
              message: `Method not found: ${message.method}`
            },
            id: message.id
          };
        }
      } else {
        // Not a valid JSON-RPC request
        return {
          jsonrpc: '2.0',
          error: {
            code: -32600,
            message: 'Invalid Request: Not a valid JSON-RPC request'
          },
          id: message.id !== undefined ? message.id : null
        };
      }
    } catch (error: any) {
      logger.error(`[${new Date().toISOString()}] Error processing request: ${error.message}`, error.stack || 'No stack trace available');
      logger.error(error.stack);
      throw error; // re-throw the error to ensure the client gets an error response
    }
  };

  /**
   * Register the HTTP Stream message handler with the MCP server
   * This is a custom extension to the McpServer class to handle HTTP Stream messages
   * according to the MCP specification
   */
  (mcpServer as any).handleHttpStreamMessage = handleHttpStreamMessage;

  // Add more tools as needed

  /**
   * Proper initialize handler with protocol validation
   * This customization ensures initialize requests are handled according to the MCP spec
   * and provides better error handling for protocol compliance
   */
  function setupExpressHandlers(app: any, mcpServer: any) {
    // Add system status monitoring
    const logSystemStatus = () => {
      try {
        // Log memory usage
        const memoryUsage = process.memoryUsage();
        const rssMB = (memoryUsage.rss / 1024 / 1024).toFixed(2);
        const heapTotalMB = (memoryUsage.heapTotal / 1024 / 1024).toFixed(2);
        const heapUsedMB = (memoryUsage.heapUsed / 1024 / 1024).toFixed(2);
        const externalMB = (memoryUsage.external / 1024 / 1024).toFixed(2);

        logger.info(`Memory Usage: RSS=${rssMB} MB, Heap Total=${heapTotalMB} MB, Heap Used=${heapUsedMB} MB, External=${externalMB} MB`);

        // Log active requests
        const count = activeRequests.size;
        logger.info(`Active requests: ${count}`);

        if (activeRequests.size > 0) {
          // Log details of all active requests
          const requestDetails = Array.from(activeRequests.entries()).map(([id, req]) => ({
            id,
            sessionId: req.sessionId,
            startTime: new Date(req.startTime).toISOString(),
            duration: `${Math.round((Date.now() - req.startTime) / 1000)}s`
          }));

          logger.info(`Active request details: ${JSON.stringify(requestDetails, null, 2)}`);
        }

        // Log uptime
        const uptime = process.uptime();
        const hours = Math.floor(uptime / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        const seconds = Math.floor(uptime % 60);
        logger.info(`Server uptime: ${hours}h ${minutes}m ${seconds}s`);
      } catch (error) {
        logger.error('Error logging server status:', error);
      }
    };

    // Log system status every 5 minutes
    setInterval(logSystemStatus, 5 * 60 * 1000);

    // Log initial system status on startup
    logSystemStatus();

    // Store the SSE transport at a higher scope
    let sseTransport: SSEServerTransport | undefined;

    // Your existing SSE endpoint
    app.get("/sse", async (req: any, res: any) => {
      // Create SSE transport and set response headers
      sseTransport = new SSEServerTransport("/messages", res);

      // Connect the transport to your MCP server
      await mcpServer.connect(sseTransport);
    });

    // Add this missing endpoint
    app.post("/messages", async (req: any, res: any) => {
      if (!sseTransport) {
        return res.status(500).json({ error: "SSE transport not initialized" });
      }

      try {
        // Pass the message to the SSE transport for handling
        await sseTransport.handlePostMessage(req, res, req.body);
      } catch (error) {
        logger.error("Error handling message:", error);
        res.status(500).json({ error: "Failed to process message" });
      }
    });

    // Process management
    process.on('SIGTERM', () => gracefulShutdown(server));
    process.on('SIGINT', () => gracefulShutdown(server));

    function gracefulShutdown(server: any): void {
      server.close(() => {
        logger.info('Server closed');
        process.exit(0);
      });

      global.setTimeout(() => {
        logger.error('Force shutdown');
        process.exit(1);
      }, 5000);
    }
  };

  const app = express();
  app.use(cors());
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: true }));

  setupExpressHandlers(app, mcpServer);

  const server = http.createServer(app);

  server.listen(process.env.PORT || 5001, () => {
    logger.info(`Server is running on port ${process.env.PORT || 5001}`);
  });

  return mcpServer;
};

/**
 * Default export of the MCP server factory function
 * @default
 */
export default createMcpServer;
