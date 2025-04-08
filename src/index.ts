// src/index.ts
// Redirect all standard logging to stderr for Claude Desktop compatibility
// This ensures only JSON-RPC messages go to stdout
console.log = console.error;
process.stdout.write = process.stderr.write.bind(process.stderr);

import * as dotenv from 'dotenv';
import { logger } from "./utils/secure-logger.js";
import { main as startMcpServer } from "./mcp-server/index.js";
import { startClientServer } from "./mcp-client/client-server.js";
import { startStdioServer } from "./mcp-server/stdio-server.js";

// Load environment variables
dotenv.config();

/**
 * Main entry point - can start MCP server, test client, or both
 * Also supports STDIO mode for Claude Desktop compatibility
 */
async function main() {
  try {
    // Check for STDIO mode first (highest priority)
    const transportMode = (process.env.TRANSPORT_MODE || '').toLowerCase();
    const startMode = (process.env.START_MODE || '').toLowerCase();
    
    if (transportMode === 'stdio' || startMode === 'stdio') {
      logger.info('Starting MCP server in STDIO mode for Claude Desktop');
      await startStdioServer();
      return;
    }
    
    // Otherwise, use the standard server mode
    const serverMode = (process.env.START_MODE || 'both').toLowerCase();
    
    switch (serverMode) {
      case 'server':
        logger.info('Starting MCP server only');
        await startMcpServer();
        break;
        
      case 'client':
        logger.info('Starting MCP test client only');
        await startClientServer();
        break;
        
      case 'both':
      default:
        logger.info('Starting both MCP server and test client');
        // Start both services
        await Promise.all([
          startMcpServer(),
          startClientServer()
        ]);
        break;
    }
    
    logger.info('Startup complete');
    
  } catch (error) {
    logger.error("Failed to start:", error);
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

export default main;
