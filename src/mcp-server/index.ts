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
        // Create transport first - let the SDK handle headers
        const transport = new SSEServerTransport('/messages', res);
        
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
        }, 30000); // Send heartbeat every 30 seconds
        
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
    
    // Configure HTTP Stream endpoint
    app.post('/stream', async (req, res) => {
      try {
        logger.info(`New HTTP Stream connection from ${req.ip}, session: ${req.mcpSessionId || 'none'}`);
        
        // Validate request body
        if (!req.body || typeof req.body !== 'object') {
          logger.warn(`Invalid request body: ${JSON.stringify(req.body)}`);
          return res.status(400).json({
            error: 'Invalid request format',
            message: 'Request body must be a valid JSON object'
          });
        }
        
        // Create transport and connect
        const transport = new HTTPStreamTransport('/stream', res, req.mcpSessionId);
        
        // Process the message if it exists in the request body
        if (Object.keys(req.body).length > 0) {
          logger.debug(`Processing message in request body: ${JSON.stringify(req.body)}`);
          // Connect to MCP server first
          await mcpServer.connect(transport);
          
          // Then process the message
          await transport.processMessage(req.body);
        } else {
          // Just connect if no message to process
          await mcpServer.connect(transport);
        }
      } catch (error) {
        logger.error(`Error handling HTTP Stream request: ${error instanceof Error ? error.message : String(error)}`);
        if (!res.headersSent) {
          res.status(500).json({
            error: 'Internal server error',
            message: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    });
    
    // Start the HTTP server
    app.listen(port, host, () => {
      logger.info(`MCP Server running on http://${host}:${port}`);
      logger.info(`Server name: ${process.env.MCP_NAME || "Dust MCP Bridge"}`);
      logger.info(`Protocol version: 2025-03-26`);
      logger.info(`Transports: SSEServerTransport, HTTPStreamTransport`);
      logger.info(`Session management: Enabled`);
      logger.info(`Rate limiting: Enabled (100 requests per 15 minutes)`);
      logger.info(`Dust workspace: ${process.env.DUST_WORKSPACE_ID || "(not configured)"}`);
      logger.info(`Dust agent: ${process.env.DUST_AGENT_ID || "(not configured)"}`);
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
