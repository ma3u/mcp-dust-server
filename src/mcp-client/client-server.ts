// src/mcp-client/client-server.ts
import express from 'express';
import path from 'path';
import { logger } from '../utils/secure-logger.js';
import * as dotenv from 'dotenv';
import http from 'http';

// Load environment variables
dotenv.config();

// Create Express app for client only
export const createClientApp = () => {
  const app = express();
  const server = http.createServer(app);

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

  // Serve static files from the public directory
  app.use(express.static(path.join(process.cwd(), 'public')));

  // Add route for client health check
  app.get('/health', (req: express.Request, res: express.Response) => {
    res.json({
      status: 'healthy',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      component: 'MCP Test Client'
    });
  });

  // Redirect root to the test client
  app.get('/', (req: express.Request, res: express.Response) => {
    res.redirect('/test-sse.html');
  });

  return { app, server };
};

// Start the client server
export const startClientServer = async () => {
  try {
    const { app, server } = createClientApp();
    
    // Use client configuration from .env
    const host = process.env.CLIENT_HOST || '0.0.0.0';
    const port = parseInt(process.env.CLIENT_PORT || '5002', 10);
    
    // Start the HTTP server
    server.listen(port, host, () => {
      logger.info(`MCP Test Client running on http://${host}:${port}`);
    });
    
    // Handle server shutdown
    const shutdown = () => {
      logger.info("Shutting down MCP Test Client...");
      server.close(() => {
        logger.info("MCP Test Client stopped");
        process.exit(0);
      });
    };
    
    // Register shutdown handlers
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    
    return { app, server, port, host };
  } catch (error) {
    logger.error("Failed to start MCP Test Client:", error);
    process.exit(1);
  }
};

export default startClientServer;
