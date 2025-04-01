// src/mcp-server/index.ts
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import crypto from 'crypto';
import * as dotenv from 'dotenv';
import { logger } from "../utils/secure-logger.js";
import { sessionManager } from "../utils/session-manager.js";
import http from 'http';
import express from 'express';
import { createMcpServer } from "./server.js";

// Load environment variables
dotenv.config();

// Initialize Express app for MCP server
const app = express();

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

// Create HTTP server
const server = http.createServer(app);

// Create the MCP server instance
const mcpServer = createMcpServer();

// Start the server
async function main() {
  try {
    // Use MCP configuration from .env
    const host = process.env.MCP_HOST || '0.0.0.0';
    const port = parseInt(process.env.MCP_PORT || '5001', 10);
    const timeout = parseInt(process.env.MCP_TIMEOUT || '30', 10) * 1000; // Convert to ms
    
    // Store active sessions for message handling
    const activeSessions = new Map<string, any>();
    
    // Add route for server health check
    app.get('/health', (req: express.Request, res: express.Response) => {
      res.json({
        status: 'healthy',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        component: 'MCP Server'
      });
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
    
    // Debug endpoint to check active connections
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

// Run the main function if this is the entry point
// ESM module compatibility - checking if this is the main module
const isMainModule = import.meta.url === `file://${process.argv[1]}`;

if (isMainModule) {
  main().catch(error => {
    logger.error("Unhandled exception:", error);
    process.exit(1);
  });
}

export { app, server, mcpServer, main };
