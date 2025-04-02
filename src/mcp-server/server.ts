// src/mcp-server/server.ts
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

// Create an MCP server with secure request and response logging
export const createMcpServer = () => {
  const mcpServer = new McpServer({ 
    name: process.env.MCP_NAME || "Dust MCP Bridge", 
    version: "1.0.0",
    onRequest: (request: any) => {
      logger.logRequest(request);
      
      // Validate request based on method
      if (request.method === 'initialize') {
        const validation = validateInitializeRequest(request);
        if (!validation.success) {
          logger.warn(`Invalid initialize request: ${JSON.stringify(validation.error.errors)}`);
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
        }
      }
    },
    onResponse: (response: any) => {
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
    },
    onError: (error: Error) => {
      logger.error("MCP ERROR:", error.message, error.stack);
    }
  });

  // Register the echo tool for testing
  mcpServer.tool("echo", { 
    message: z.string().describe("Message to echo back")
  }, async ({ message }) => {
    logger.info(`Received echo message: ${message}`);
    return { content: [{ type: "text", text: `Echo: ${message}` }] };
  });

  // Query Dust AI agent
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

  // Create a handler for HTTP Stream messages according to MCP specification
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
          // Handle initialize request
          return {
            jsonrpc: '2.0',
            result: {
              protocol_version: '2025-03-26',
              server: {
                name: process.env.MCP_NAME || "Dust MCP Bridge",
                version: '1.0.0'
              }
            },
            id: message.id
          };
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

  // Register the HTTP Stream message handler with the MCP server
  // This is a custom extension to the McpServer class to handle HTTP Stream messages
  (mcpServer as any).handleHttpStreamMessage = handleHttpStreamMessage;

  return mcpServer;
};

export default createMcpServer;
