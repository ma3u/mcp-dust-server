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
import { z } from "zod";
import * as dotenv from 'dotenv';
import { dustClient, DustClient } from "../api/dust-client.js";
import { logger } from "../utils/secure-logger.js";
import { conversationHistory, ConversationMessage } from "../utils/conversation-history.js";
import { validateMessageRequest, validateInitializeRequest, validateTerminateRequest } from "../schemas/context-validation.js";
import crypto from 'crypto';

// Load environment variables
dotenv.config();

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
      // Add explicit error handling for all requests
      try {
        // Log request with more details for debugging
        console.error('MCP Request received:', JSON.stringify(request, null, 2));
        logger.logRequest(request);
        logger.debug('Received message:', JSON.stringify(request));
        
        // Validate request based on method
        if (request.method === 'initialize') {
          console.error('Processing initialize request with params:', JSON.stringify(request.params, null, 2));
          const validation = validateInitializeRequest(request);
          if (!validation.success) {
            logger.warn(`Invalid initialize request: ${JSON.stringify(validation.error.errors)}`);
            console.error('Initialize validation failed:', JSON.stringify(validation.error.errors));
          } else {
            console.error('Initialize validation succeeded');
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
        console.error('Processing terminate request');
        const validation = validateTerminateRequest(request);
        if (!validation.success) {
          logger.warn(`Invalid terminate request: ${JSON.stringify(validation.error.errors)}`);
          console.error('Terminate validation failed:', JSON.stringify(validation.error.errors));
        }
      }
      } catch (error) {
        console.error('Error in onRequest handler:', error);
        logger.error('Error in onRequest handler:', error);
      }
    },
    onResponse: (response: any) => {
      try {
        // Log response with more details for debugging
        console.error('MCP Response sent:', JSON.stringify(response, null, 2));
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
      } catch (error) {
        console.error('Error in onResponse handler:', error);
        logger.error('Error in onResponse handler:', error);
      }
    },
    onError: (error: Error) => {
      console.error("MCP ERROR:", error.message, error.stack);
      logger.error("MCP ERROR:", error.message, error.stack);
    }
  });

  /**
   * Register the echo tool for testing MCP functionality
   * This simple tool echoes back any message sent to it
   */
  mcpServer.tool("echo", { 
    message: z.string().describe("Message to echo back")
  }, async ({ message }) => {
    logger.info(`Received echo message: ${message}`);
    return { content: [{ type: "text", text: `Echo: ${message}` }] };
  });

  /**
   * Register the dust-query tool for interacting with Dust AI
   * This tool forwards queries to the configured Dust agent and returns responses
   */
  mcpServer.tool("dust-query", {
    query: z.string().describe("Your question or request for the AI agent")
  }, async ({ query }) => {
    logger.info(`Sending query to Dust agent: ${query}`);
    
    try {
      // Get dust client instance
      const dustClientInstance = DustClient.getInstance();
      const client = dustClientInstance.getClient();
      const userContext = dustClientInstance.getUserContext();
      
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
      
      // Log conversation and message IDs for reference
      logger.debug(`Conversation ID: ${conversation.sId}, Message ID: ${message.sId}`);
      
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
      console.error('Initialize request received:', JSON.stringify(message, null, 2));
      
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
        console.error('Sending initialize response:', JSON.stringify(response, null, 2));
        
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
      } catch (error) {
        logger.error(`Error handling initialize request: ${error}`);
        console.error('Error handling initialize request:', error);
        
        // Ensure we still send a response even if there's an error
        const errorResponse = {
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
        
        if (transport && typeof transport.send === 'function') {
          await transport.send(errorResponse);
        }
        
        return errorResponse;
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
                  mentions: [{ configurationId: dustClient.getAgentId() }],
                  context: userContext
                }
              });
              
              if (dustResult.isErr()) {
                const errorMessage = dustResult.error?.message || "Unknown error";
                logger.error(`Error creating conversation: ${errorMessage}`);
                throw new Error(errorMessage);
              }
              
              // Get conversation and message details
              const { conversation, message } = dustResult.value;
              
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
                
                if (event.type === "generation_tokens" && event.text) {
                  answer = (answer + event.text).trim();
                } else if (event.type === "agent_message_success") {
                  answer = event.message?.content || answer;
                }
              }
              
              result = { response: answer || "No response from agent" };
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
          } catch (error) {
            logger.error(`Error executing tool: ${error instanceof Error ? error.message : String(error)}`);
            return {
              jsonrpc: '2.0',
              error: { 
                code: -32603, 
                message: `Internal error: ${error instanceof Error ? error.message : 'Unknown error'}` 
              },
              id: message.id
            };
          }
        } else if (message.method === 'message') {
          // Handle message request - this is where tool calls are processed
          try {
            // Extract the tool call if present
            const toolCall = message.params?.message?.tool_calls?.[0];
            
            if (toolCall && toolCall.name) {
              let result;
              
              // Process based on the tool name
              if (toolCall.name === 'echo') {
                const echoMessage = toolCall.parameters?.message;
                logger.info(`Received echo message: ${echoMessage}`);
                result = { content: [{ type: "text", text: `Echo: ${echoMessage}` }] };
              } else if (toolCall.name === 'dust-query') {
                const query = toolCall.parameters?.query;
                logger.info(`Sending query to Dust agent: ${query}`);
                
                // Get dust client instance
                const dustClientInstance = DustClient.getInstance();
                const client = dustClientInstance.getClient();
                const userContext = dustClientInstance.getUserContext();
                
                // Create a conversation with the Dust agent
                const dustResult = await client.createConversation({
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
                
                // Process the Dust result
                if (dustResult.isErr()) {
                  const errorMessage = dustResult.error?.message || "Unknown error";
                  logger.error(`Error creating conversation: ${errorMessage}`);
                  result = { content: [{ type: "text", text: `Error: ${errorMessage}` }] };
                } else {
                  // Get conversation and message details
                  const { conversation, message } = dustResult.value;
                  
                  // Stream the agent's response
                  const streamResult = await client.streamAgentAnswerEvents({
                    conversation,
                    userMessageId: message.sId,
                  });
                  
                  if (streamResult.isErr()) {
                    const errorMessage = streamResult.error?.message || "Unknown error";
                    logger.error(`Error streaming response: ${errorMessage}`);
                    result = { content: [{ type: "text", text: `Error streaming response: ${errorMessage}` }] };
                  } else {
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
                  }
                }
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
          } catch (error) {
            logger.error(`Error processing message: ${error instanceof Error ? error.message : String(error)}`);
            return {
              jsonrpc: '2.0',
              error: {
                code: -32603,
                message: `Internal error: ${error instanceof Error ? error.message : 'Unknown error'}`
              },
              id: message.id
            };
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
    } catch (error) {
      logger.error(`Error handling HTTP Stream message: ${error instanceof Error ? error.message : String(error)}`);
      return {
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: `Internal error: ${error instanceof Error ? error.message : 'Unknown error'}`
        },
        id: message.id !== undefined ? message.id : null
      };
    }
  };

  /**
   * Register the HTTP Stream message handler with the MCP server
   * This is a custom extension to the McpServer class to handle HTTP Stream messages
   * according to the MCP specification
   */
  (mcpServer as any).handleHttpStreamMessage = handleHttpStreamMessage;

  // Proper initialize handler with protocol validation
  const setupExpressHandlers = (app: any, server: any) => {
    app.post('/stream', (req: any, res: any) => {
      try {
        if (req.body && req.body.method === 'initialize') {
          console.error('INIT REQ:', JSON.stringify(req.body));
          
          // Set proper headers for JSON response
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Connection', 'keep-alive');
          
          // Create a valid JSON-RPC 2.0 response
          const response = {
            jsonrpc: "2.0",
            result: {
              protocolVersion: "2024-11-05",
              serverInfo: {
                name: "dust-mcp-server",
                version: "1.0.0"
              },
              capabilities: {
                toolRegistry: true,
                sessionManagement: true
              }
            },
            id: req.body.id || 0
          };
          
          // Log the response for debugging
          console.error('INIT RES:', JSON.stringify(response));
          
          // Send the response as proper JSON - use end with stringified JSON to avoid express adding extra content
          return res.end(JSON.stringify(response));
        }
      } catch (error) {
        // Log the error for debugging
        console.error('INIT ERROR:', error instanceof Error ? error.stack : String(error));
        
        // Send a proper error response - use end with stringified JSON to avoid express adding extra content
        const errorResponse = {
          jsonrpc: "2.0",
          error: { 
            code: -32603, 
            message: "Internal server error: " + (error instanceof Error ? error.message : String(error)) 
          },
          id: req.body?.id || null
        };
        return res.status(500).end(JSON.stringify(errorResponse));
      }
    });

    // Process management
    process.on('SIGTERM', () => gracefulShutdown(server));
    process.on('SIGINT', () => gracefulShutdown(server));

    function gracefulShutdown(server: any) {
      server.close(() => {
        console.log('Server closed');
        process.exit(0);
      });

      setTimeout(() => {
        console.error('Force shutdown');
        process.exit(1);
      }, 5000);
    }
  };

  // Expose the setup function
  (mcpServer as any).setupExpressHandlers = setupExpressHandlers;

  return mcpServer;
};

/**
 * Default export of the MCP server factory function
 * @default
 */
export default createMcpServer;
