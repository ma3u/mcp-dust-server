// src/index.ts
// Debug information for server initialization
console.error('Process environment:', process.env);
console.error('Resolved node path:', process.execPath);
console.error('Current working directory:', process.cwd());
console.error('Node version:', process.version);
console.error('Command line arguments:', process.argv);

import * as dotenv from 'dotenv';
import { logger } from "./utils/secure-logger.js";
import { main as startMcpServer } from "./mcp-server/index.js";
import { startClientServer } from "./mcp-client/client-server.js";

// Load environment variables
dotenv.config();

/**
 * Main entry point - can start MCP server, test client, or both
 */
async function main() {
  try {
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
