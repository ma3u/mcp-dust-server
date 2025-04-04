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
import { findAvailablePort } from '../utils/portManager.js';
import { getServiceRegistry } from '../utils/registry-factory.js';
import { defaultConfig, getInstanceId, getServerName } from '../config/instance-config.js';
import { v4 as uuidv4 } from 'uuid';

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

// Add singleton enforcement
let serverInstance: any = null;

// Start the server
async function main() {
  // Debug logging for MCP server initialization
  console.error('MCP Server initialization starting');
  console.error('Node path:', process.execPath);
  console.error('NVM path:', process.env.NVM_DIR);
  console.error('NODE_PATH:', process.env.NODE_PATH);
  console.error('PATH:', process.env.PATH);
  console.error('Dust API Key:', process.env.DUST_API_KEY ? '***' + process.env.DUST_API_KEY.slice(-4) : 'not set');
  console.error('Dust Workspace ID:', process.env.DUST_WORKSPACE_ID || 'not set');
  console.error('Dust Agent ID:', process.env.DUST_AGENT_ID || 'not set');
  try {
    // Check if server is already running
    if (serverInstance) {
      logger.error('Server already running');
      return;
    }
    
    // Get the instance ID for this server
    const instanceId = getInstanceId();
    logger.info(`Starting MCP server instance ${instanceId}`);
    
    // Get the service registry
    const serviceRegistry = await getServiceRegistry();
    
    // Find an available port dynamically using the configured port range
    const port = await findAvailablePort(defaultConfig.portConfig);
    
    // Use MCP configuration from .env
    const host = process.env.MCP_HOST || '0.0.0.0';
    
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
    
    // Add route for API status endpoint
    app.get('/api/v1/status', (req, res) => {
      res.json({
        status: 'operational',
        version: process.env.npm_package_version,
        workspace: process.env.DUST_WORKSPACE_ID,
        agent: process.env.DUST_AGENT_ID,
        uptime: process.uptime(),
        instanceId: instanceId,
        port: port
      });
    });
    
    // Add route for instance information
    app.get('/api/v1/instance', async (req, res) => {
      try {
        const instances = await serviceRegistry.getActiveInstances();
        res.json({
          currentInstance: {
            id: instanceId,
            port: port,
            uptime: process.uptime(),
            startTime: new Date(Date.now() - (process.uptime() * 1000)).toISOString()
          },
          activeInstances: Array.from(instances.entries()).map(([id, p]) => ({
            id,
            port: p,
            isCurrent: id === instanceId
          }))
        });
      } catch (error) {
        logger.error('Error retrieving instance information:', error);
        res.status(500).json({ error: 'Failed to retrieve instance information' });
      }
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
        // @ts-ignore - Accessing internal property for direct message handling
        transport.onMessage = async (message: any) => {
          try {
            // Log the message for debugging
            console.error(`SSE message received: ${JSON.stringify(message, null, 2)}`);
            logger.debug(`SSE message received: ${JSON.stringify(message)}`);
            
            // Special handling for initialize method to avoid double-response issues
            if (message.method === 'initialize' && message.jsonrpc === '2.0' && message.id !== undefined) {
              console.error('Handling initialize message from client:', JSON.stringify(message, null, 2));
              logger.info('Handling initialize message from client');
              
              try {
                // Extract client info from the message
                const clientName = message.params.clientInfo?.name || message.params.client?.name || 'Unknown Client';
                const clientVersion = message.params.clientInfo?.version || message.params.client?.version || '0.0.0';
                const protocolVersion = message.params.protocolVersion || message.params.protocol_version || '2024-11-05';
                
                console.error(`Client connected: ${clientName} v${clientVersion} using protocol ${protocolVersion}`);
                
                // Create initialize response with correct format according to MCP spec
                const response = {
                  jsonrpc: "2.0" as const,
                  result: {
                    protocol_version: '2024-11-05',
                    server: {
                      name: process.env.MCP_NAME || "Dust MCP Bridge",
                      version: '1.0.0'
                    },
                    capabilities: {
                      tools: ['echo', 'dust-query']
                    }
                  },
                  id: message.id
                };
                
                // Send response directly through transport
                console.error('Sending initialize response:', JSON.stringify(response, null, 2));
                await transport.send(response);
                
                // Important: Don't pass initialize messages to the MCP server to avoid double-response
                return;
              } catch (error) {
                console.error('Error handling initialize message:', error);
                logger.error('Error handling initialize message:', error);
                
                // Send error response
                const errorResponse = {
                  jsonrpc: "2.0" as const,
                  error: {
                    code: -32603,
                    message: `Internal server error: ${error instanceof Error ? error.message : String(error)}`
                  },
                  id: message.id
                };
                
                await transport.send(errorResponse);
                return;
              }
            }
            
            // For all other messages, let the MCP server handle them normally
            // @ts-ignore - Accessing internal method for direct message processing
            console.error('Passing message to MCP server:', message.method);
            await (mcpServer as any)._onMessage(message);
          } catch (error) {
            console.error('Error in SSE message handler:', error);
            logger.error('Error in SSE message handler:', error);
          }
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

    // Function to try starting the server with port fallback
    const startServer = async (currentPort: number, retryCount = 0, maxRetries = 5): Promise<any> => {
      return new Promise((resolve, reject) => {
        try {
          const instance = app.listen(currentPort, host, () => {
            logger.info(`MCP Server running on http://${host}:${currentPort}`);
            logger.info(`Server name: ${process.env.MCP_NAME || "Dust MCP Bridge"}`);
            logger.info(`Protocol version: 2024-11-05`);
            logger.info(`Transports: SSEServerTransport, HTTPStreamTransport`);
            logger.info(`Session management: Enabled`);
            logger.info(`Rate limiting: Enabled (100 requests per 15 minutes)`);
            logger.info(`Dust workspace: ${process.env.DUST_WORKSPACE_ID || "(not configured)"}`);
            logger.info(`Dust agent: ${process.env.DUST_AGENT_ID || "(not configured)"}`); 
            
            // Register this instance with the service registry
            serviceRegistry.registerInstance(instanceId, currentPort)
              .then(() => {
                logger.info(`Instance ${instanceId} registered with service registry on port ${currentPort}`);
              })
              .catch(err => {
                logger.error(`Failed to register instance ${instanceId} with service registry:`, err);
              });
            
            // Log to console for Claude logs
            console.error(`Server instance ${instanceId} started on port ${currentPort}`);
            
            resolve(instance);
          });

          instance.on('error', (err: any) => {
            if (err.code === 'EADDRINUSE' && retryCount < maxRetries) {
              // Port is in use, try the next port
              const nextPort = currentPort + 1;
              logger.warn(`Port ${currentPort} is already in use, trying port ${nextPort}`);
              instance.close();
              resolve(startServer(nextPort, retryCount + 1, maxRetries));
            } else {
              reject(err);
            }
          });
        } catch (error) {
          reject(error);
        }
      });
    };

    // Start the HTTP server with port fallback
    serverInstance = await startServer(port);
    
    // Add error handling for the server (for errors after successful startup)
    serverInstance.on('error', (error: any) => {
      logger.error('Server error:', error);
    });

    // Set up Express handlers and process management
    if ((mcpServer as any).setupExpressHandlers) {
      (mcpServer as any).setupExpressHandlers(app, serverInstance);
      logger.info('Express handlers and process management set up');
    } else {
      logger.warn('setupExpressHandlers not available, using fallback shutdown handlers');
      
      // Fallback graceful shutdown handler
      const gracefulShutdown = async () => {
        logger.info(`Shutting down MCP server instance ${instanceId}...`);
        
        try {
          // Deregister this instance from the service registry
          await serviceRegistry.deregisterInstance(instanceId);
          logger.info(`Instance ${instanceId} deregistered from service registry`);
        } catch (error) {
          logger.error(`Failed to deregister instance ${instanceId}:`, error);
        }
        
        serverInstance.close(() => {
          logger.info(`Server instance ${instanceId} closed`);
          process.exit(0);
        });

        setTimeout(() => {
          logger.error('Force shutdown after timeout');
          process.exit(1);
        }, 5000);
      };
      
      // Register shutdown handlers
      process.on('SIGINT', gracefulShutdown);
      process.on('SIGTERM', gracefulShutdown);
    }
    
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
