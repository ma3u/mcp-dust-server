// src/server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import crypto from 'crypto';
import { z } from "zod";
import * as dotenv from 'dotenv';
import { dustClient, DustClient } from "./api/dust-client.js";
import { logger } from "./utils/secure-logger.js";
import { sessionManager } from "./utils/session-manager.js";
import http from 'http';
import express from 'express';
import path from 'path';

// Load environment variables
dotenv.config();

// Initialize Express app with middleware
const app = express();

// Initialize app settings - no rate limiting as per user preference

// Basic security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

// Serve static files from the public directory
app.use(express.static(path.join(process.cwd(), 'public')));

// Create HTTP server
const server = http.createServer(app);

// Create an MCP server with secure request and response logging
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

// Systems thinking analysis tool for cognitive neuroscience insights
mcpServer.tool("systems-thinking", "Analyze architecture using cognitive neuroscience principles", {
  prompt: z.string().describe("Description of the system to analyze")
}, async (args) => {
  logger.info(`Running systems thinking analysis: ${args.prompt}`);
  
  // Create a session for this analysis
  const session = sessionManager.createSession({
    toolName: "systems-thinking",
    prompt: args.prompt,
    timestamp: new Date()
  });
  
  try {
    // Get dust client instance
    const dustClientInstance = DustClient.getInstance();
    const dustAPI = dustClientInstance.getClient();
    const userContext = dustClientInstance.getUserContext();
    
    // Create a specialization query that includes systems thinking prompts
    const systemsPrompt = `
    ${args.prompt}
    
    Please analyze using the following systems thinking frameworks:
    1. Hierarchical organization (similar to brain structure)
    2. Modularity vs. integration tradeoffs
    3. Feedback loop mechanisms
    4. Information flow optimization
    5. Error detection and correction systems
    6. Adaptability mechanisms
    
    Provide specific recommendations that incorporate cognitive principles.
    `;
    
    // Create a conversation with the Dust agent
    const result = await dustAPI.createConversation({
      title: "Systems Thinking Analysis",
      visibility: "unlisted",
      message: {
        content: systemsPrompt,
        mentions: [
          { configurationId: dustClient.getAgentId() }
        ],
        context: userContext
      }
    });

    if (result.isErr()) {
      const errorMessage = result.error?.message || "Unknown error";
      logger.error(`Error creating systems analysis: ${errorMessage}`);
      return { content: [{ type: "text", text: `Analysis error: ${errorMessage}` }] };
    }

    // Get conversation and message details
    const { conversation, message } = result.value;
    logger.info(`Created systems analysis conversation: ${conversation.sId}`);
    
    // Update session with conversation data
    sessionManager.updateSession(session.id, {
      conversationId: conversation.sId,
      messageId: message.sId
    });
    
    // Stream the agent's response
    const streamResult = await dustAPI.streamAgentAnswerEvents({
      conversation,
      userMessageId: message.sId,
    });
    
    if (streamResult.isErr()) {
      const errorMessage = streamResult.error?.message || "Unknown error";
      logger.error(`Error streaming systems analysis: ${errorMessage}`);
      return { content: [{ type: "text", text: `Analysis streaming error: ${errorMessage}` }] };
    }
    
    // Process the streamed response
    const { eventStream } = streamResult.value;
    let analysis = "";
    
    try {
      for await (const event of eventStream) {
        if (!event) continue;
        
        switch (event.type) {
          case "user_message_error":
          case "agent_error":
            const errorMsg = event.error?.message || "Unknown error";
            logger.error(`Analysis error: ${errorMsg}`);
            return { content: [{ type: "text", text: `Systems analysis error: ${errorMsg}` }] };
            
          case "generation_tokens":
            if (event.classification === "tokens") {
              analysis = (analysis + event.text).trim();
            }
            break;
            
          case "agent_message_success":
            analysis = event.message?.content || analysis;
            break;
        }
      }
      
      // Update session with the completed analysis
      sessionManager.updateSession(session.id, {
        analysis,
        completed: true,
        completedAt: new Date()
      });
      
      return { 
        content: [{ 
          type: "text", 
          text: analysis || "No analysis was generated"
        }] 
      };
      
    } catch (streamError) {
      logger.error("Error processing analysis stream:", streamError);
      return { 
        content: [{ 
          type: "text", 
          text: `Error processing systems analysis: ${streamError instanceof Error ? streamError.message : String(streamError)}`
        }] 
      };
    }
  } catch (error) {
    logger.error("Exception during systems analysis:", error);
    return { 
      content: [{ 
        type: "text", 
        text: `Systems analysis error: ${error instanceof Error ? error.message : String(error)}`
      }] 
    };
  }
});

// Start the server
async function main() {
  try {
    // Use MCP configuration from .env
    const host = process.env.MCP_HOST || '0.0.0.0';
    const port = parseInt(process.env.MCP_PORT || '5001', 10);
    const timeout = parseInt(process.env.MCP_TIMEOUT || '30', 10) * 1000; // Convert to ms
    
    // Configure CORS for all routes
    app.use((req, res, next) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      if (req.method === 'OPTIONS') {
        return res.status(200).end();
      }
      next();
    });
    
    // Store active sessions for message handling
    const activeSessions = new Map<string, any>();
    
    // Add route for server health check
    app.get('/health', (req: express.Request, res: express.Response) => {
      res.json({
        status: 'healthy',
        version: '1.0.0',
        timestamp: new Date().toISOString()
      });
    });
    
    // Redirect root to the test client
    app.get('/', (req: express.Request, res: express.Response) => {
      res.redirect('/test-sse.html');
    });
    
    // Custom SSE endpoint implementation
    app.get('/sse', (req: express.Request, res: express.Response) => {
      try {
        // Generate a unique session ID and endpoint path
        const sessionId = crypto.randomUUID();
        const endpoint = `/message/${sessionId}`;
        
        // Setup SSE connection
        // We'll handle the headers manually to avoid conflicts
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.status(200);
        
        // First send a simple message that connection is established
        res.write(`data: ${JSON.stringify({ connected: true })}\n\n`);
        
        // Create a transport with the custom endpoint but don't initialize with res yet
        // This prevents the transport from attempting to set headers
        const transport = new SSEServerTransport(endpoint, res);
        
        // Store the transport in our sessions map
        activeSessions.set(sessionId, transport);
        
        // Initialize the transport and connect to MCP server
        // We do this in a separate async function to avoid blocking
        (async () => {
          try {
            await transport.start();
            await mcpServer.connect(transport);
            
            // Now send session info to the client
            res.write(`event: session\ndata: ${JSON.stringify({ sessionId, messageEndpoint: endpoint })}\n\n`);
            logger.info(`New SSE session established: ${sessionId}`);
          } catch (error) {
            logger.error(`Error initializing transport for session ${sessionId}: ${error instanceof Error ? error.message : String(error)}`);
          }
        })();
        
        // Setup heartbeat to keep connection alive
        const heartbeatInterval = setInterval(() => {
          if (res.writableEnded) {
            clearInterval(heartbeatInterval);
            return;
          }
          
          try {
            res.write(`:heartbeat\n\n`);
          } catch (error) {
            clearInterval(heartbeatInterval);
            logger.error(`Error sending heartbeat to ${sessionId}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }, 15000);
        
        // Handle client disconnect
        req.on('close', () => {
          clearInterval(heartbeatInterval);
          
          // Close the transport if it exists
          const transport = activeSessions.get(sessionId);
          if (transport) {
            transport.close().catch((error: Error) => {
              logger.error(`Error closing transport for session ${sessionId}: ${error.message}`);
            });
          }
          
          // Remove from active sessions
          activeSessions.delete(sessionId);
          logger.info(`SSE session closed: ${sessionId}`);
        });
      } catch (error) {
        logger.error(`Error in SSE handler: ${error instanceof Error ? error.message : String(error)}`);
        if (!res.headersSent) {
          res.status(500).send('Internal Server Error');
        } else if (!res.writableEnded) {
          res.end();
        }
      }
    });
    
    // Handle incoming messages from clients
    app.post('/message/:sessionId', express.json(), async (req: express.Request, res: express.Response) => {
      try {
        const { sessionId } = req.params;
        const transport = activeSessions.get(sessionId);
        
        if (!transport) {
          logger.warn(`Message received for unknown session: ${sessionId}`);
          return res.status(404).json({ error: 'Session not found' });
        }
        
        // Process the message using the transport's handler
        await transport.handlePostMessage(req, res, req.body);
      } catch (error) {
        logger.error(`Error handling message: ${error instanceof Error ? error.message : String(error)}`);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Error processing message' });
        }
      }
    });
    
    // Debug endpoint to check active sessions
    app.get('/debug/sessions', (req: express.Request, res: express.Response) => {
      const sessions = Array.from(activeSessions.keys()).map(id => ({ id }));
      res.json({
        activeSessions: sessions.length,
        sessions
      });
    });
    
    // Add a debug endpoint to check active connections
    app.get('/debug/connections', (req: express.Request, res: express.Response) => {
      const connections = Array.from(activeSessions.keys()).map(sessionId => ({ sessionId }));
      res.json({
        activeConnections: connections.length,
        connections
      });
    });
    
    // Start the HTTP server
    server.listen(port, host, () => {
      logger.info(`MCP Server running on http://${host}:${port} (timeout: ${timeout/1000}s)`);
      logger.info(`Server name: ${process.env.MCP_NAME || "Dust MCP Bridge"}`);
      logger.info(`Dust workspace: ${process.env.DUST_WORKSPACE_ID || "(not configured)"}`);
      logger.info(`Dust agent: ${process.env.DUST_AGENT_ID || "(not configured)"}`);
    });
    
    // Handle server shutdown
    const shutdown = () => {
      logger.info("Shutting down MCP server...");
      sessionManager.stopCleanupJob();
      server.close(() => {
        logger.info("MCP server stopped");
        process.exit(0);
      });
    };
    
    // Register shutdown handlers
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    
  } catch (error) {
    logger.error("Failed to start server:", error);
    process.exit(1);
  }
}

// Run the main function
main().catch(error => {
  logger.error("Unhandled exception:", error);
  process.exit(1);
});
