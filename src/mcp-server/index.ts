// src/mcp-server/index.ts
import * as dotenv from 'dotenv';
import { logger } from "../utils/secure-logger.js";
import express from 'express';
import { json } from 'express';
import { createMcpServer } from "./server.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { HTTPStreamTransport } from "../utils/http-stream-transport.js";
import { createSessionMiddleware, sessionActivityMiddleware } from "../middleware/session-middleware.js";
import rateLimit from 'express-rate-limit';

// Load environment variables
dotenv.config();

// Initialize Express app for MCP server
const app = express();

// Parse JSON requests
app.use(json());

// Basic security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

// Configure CORS for all routes
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Last-Event-ID, Mcp-Session-Id');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Type, Last-Event-ID');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  next();
});

// Apply rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests from this IP, please try again after 15 minutes'
});

app.use(apiLimiter);

// Apply session middleware
app.use(createSessionMiddleware({
  createIfMissing: true,
  extendSession: true
}));

// Track session activity
app.use(sessionActivityMiddleware());

// Create the MCP server instance
const mcpServer = createMcpServer();

// Start the server
async function main() {
  try {
    // Use MCP configuration from .env
    const host = process.env.MCP_HOST || '0.0.0.0';
    const port = parseInt(process.env.MCP_PORT || '5001', 10);
    
    // Add route for server health check
    app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        component: 'MCP Server',
        activeSessions: req.mcpSessionId ? 1 : 0
      });
    });

    // Add route for server readiness check
    app.get('/ready', (req, res) => {
      res.json({
        status: 'ready',
        version: '1.0.0',
        timestamp: new Date().toISOString()
      });
    });
    
    // Add route for server liveness check
    app.get('/live', (req, res) => {
      res.json({
        status: 'alive',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
      });
    });
    
    // Configure SSE endpoint
    app.get('/sse', async (req, res) => {
      logger.info(`New SSE connection from ${req.ip}, session: ${req.mcpSessionId || 'none'}`);
      
      try {
        // Set up SSE headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no'); // Disable buffering for Nginx
        
        // Create transport
        const transport = new SSEServerTransport('/messages', res);
        
        // Register a message handler for the transport
        // We need to use a custom approach to intercept initialize messages
        // @ts-ignore - Accessing internal property for direct message handling
        transport.onMessage = async (message: any) => {
          logger.debug(`SSE message received: ${JSON.stringify(message)}`);
          
          // Special handling for initialize method
          if (message.method === 'initialize' && message.jsonrpc === '2.0' && message.id !== undefined) {
            logger.info('Fast-tracking SSE initialize response');
            
            // Send initialize response immediately to prevent timeout
            const response = {
              jsonrpc: "2.0" as const,  // Use const assertion to match expected type
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
            
            // Send response directly through transport
            await transport.send(response);
          }
          
          // Let the MCP server handle the message normally
          // @ts-ignore - Accessing internal method for direct message processing
          await (mcpServer as any)._onMessage(message);
        };
        
        // Connect to MCP server
        await mcpServer.connect(transport);
        
        // Set up heartbeat to keep connection alive (after transport is connected)
        const heartbeatInterval = setInterval(() => {
          if (!res.writableEnded) {
            // Use direct write for heartbeat to avoid conflicts with SDK
            res.write(`event: heartbeat\ndata: ${JSON.stringify({ timestamp: new Date().toISOString() })}\n\n`);
          } else {
            clearInterval(heartbeatInterval);
          }
        }, 15000); // Send heartbeat every 15 seconds (reduced from 30s)
        
        // Handle client disconnect
        req.on('close', () => {
          clearInterval(heartbeatInterval);
          logger.info(`SSE connection closed from ${req.ip}, session: ${req.mcpSessionId || 'none'}`);
        });
      } catch (error) {
        logger.error(`Error establishing SSE connection: ${error instanceof Error ? error.message : String(error)}`);
        if (!res.headersSent) {
          res.status(500).send('Error establishing SSE connection');
        }
      }
    });
    
    // Configure HTTP Stream endpoint according to MCP specification
    app.post('/stream', async (req, res) => {
      try {
        logger.info(`New HTTP Stream connection from ${req.ip}, session: ${req.mcpSessionId || 'none'}`);
        
        // Set appropriate headers for JSON-RPC response
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Mcp-Session-Id');
        
        // Validate request body
        if (!req.body || typeof req.body !== 'object') {
          logger.warn(`Invalid request body: ${JSON.stringify(req.body)}`);
          return res.status(400).json({
            jsonrpc: '2.0',
            error: { 
              code: -32600, 
              message: 'Invalid Request: Request body must be a valid JSON object' 
            },
            id: null
          });
        }
        
        // Get the session ID from the request headers
        const sessionId = req.mcpSessionId || req.headers['mcp-session-id'] as string;
        
        if (!sessionId) {
          logger.warn('Missing session ID in HTTP Stream request');
          return res.status(400).json({
            jsonrpc: '2.0',
            error: { 
              code: -32602, 
              message: 'Missing session ID' 
            },
            id: req.body.id || null
          });
        }
        
        // For JSON-RPC messages, use the HTTP Stream message handler
        if (req.body.jsonrpc === '2.0' && req.body.method && req.body.id !== undefined) {
          logger.debug(`Processing JSON-RPC message: ${JSON.stringify(req.body)}`);
          
          // Use the registered HTTP Stream message handler
          if ((mcpServer as any).handleHttpStreamMessage) {
            const response = await (mcpServer as any).handleHttpStreamMessage(req.body, sessionId);
            
            // Send the response back
            return res.status(200).json(response);
          } else {
            logger.error('HTTP Stream message handler not registered');
            return res.status(500).json({
              jsonrpc: '2.0',
              error: { 
                code: -32603, 
                message: 'Internal server error: HTTP Stream message handler not registered' 
              },
              id: req.body.id || null
            });
          }
        } else {
          // For non-JSON-RPC messages or connection establishment, use the transport
          // Create a transport for this request
          const transport = new HTTPStreamTransport('/stream', res, sessionId);
          
          // Connect to MCP server first
          await mcpServer.connect(transport);
          
          // Process the message if it exists in the request body
          if (Object.keys(req.body).length > 0) {
            logger.debug(`Processing non-JSON-RPC message: ${JSON.stringify(req.body)}`);
            
            // Process the message through the transport
            await transport.processMessage(req.body);
          } else {
            // Just keep the connection open if no message to process
            logger.debug('No message in request body, keeping connection open');
          }
        }
      } catch (error) {
        logger.error(`Error handling HTTP Stream request: ${error instanceof Error ? error.message : String(error)}`);
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: '2.0',
            error: { 
              code: -32603, 
              message: 'Internal server error: ' + (error instanceof Error ? error.message : 'Unknown error') 
            },
            id: req.body.id || null
          });
        }
      }
    });
    
    // Set up global error handlers
    process.on('uncaughtException', (err) => {
      logger.error('Unhandled exception:', err);
      // Keep the process running despite the error
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled rejection at:', promise, 'reason:', reason);
      // Keep the process running despite the error
    });

    // Start the HTTP server
    const server = app.listen(port, host, () => {
      logger.info(`MCP Server running on http://${host}:${port}`);
      logger.info(`Server name: ${process.env.MCP_NAME || "Dust MCP Bridge"}`);
      logger.info(`Protocol version: 2024-11-05`);
      logger.info(`Transports: SSEServerTransport, HTTPStreamTransport`);
      logger.info(`Session management: Enabled`);
      logger.info(`Rate limiting: Enabled (100 requests per 15 minutes)`);
      logger.info(`Dust workspace: ${process.env.DUST_WORKSPACE_ID || "(not configured)"}`);
      logger.info(`Dust agent: ${process.env.DUST_AGENT_ID || "(not configured)"}`);
    });
    
    // Add error handling for the server
    server.on('error', (error) => {
      logger.error('Server error:', error);
    });

    // Handle server shutdown
    const shutdown = () => {
      logger.info("Shutting down MCP server...");
      process.exit(0);
    };
    
    // Register shutdown handlers
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    
  } catch (error) {
    logger.error("Failed to start server:", error);
    process.exit(1);
  }
}

// Run the main function if this is the entry point
// ESM module compatibility - checking if this is the main module
const isMainModule = import.meta.url === `file://${process.argv[1]}`;

if (isMainModule) {
  main().catch(error => {
    logger.error("Unhandled exception:", error);
    process.exit(1);
  });
}

export { app, mcpServer, main };
