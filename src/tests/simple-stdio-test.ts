/**
 * Simple STDIO test for MCP Server
 * This is a minimal test to diagnose issues with the STDIO transport
 */

import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import { logger } from '../utils/secure-logger.js';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Ensure we're using test environment
console.error(`Using test environment with MCP_NAME: ${process.env.MCP_NAME}`);

// Configure logging
const LOG_DIR = path.join(process.cwd(), 'logs');
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

const LOG_FILE = path.join(LOG_DIR, `simple-stdio-test-${new Date().toISOString().replace(/:/g, '-')}.log`);
const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });

// Helper function to log messages
function log(message: string): void {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  console.error(logMessage); // Use stderr to avoid interfering with stdio transport
  logStream.write(logMessage + '\n');
}

// Simple test function
async function runSimpleTest(): Promise<void> {
  log('Starting simple STDIO test');
  
  // Start the server process with environment variables to help debugging
  log('Starting server process with test environment');
  const serverProcess = spawn('node', 
    ['--inspect', '--loader', 'ts-node/esm', 'src/mcp-server/stdio-server.ts'], 
    {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { 
        ...process.env, 
        NODE_ENV: 'test',
        DEBUG: 'true',
        LOG_LEVEL: 'debug',
        DOTENV_CONFIG_PATH: '.env.test'
      }
    }
  );
  
  log(`Server process started with PID: ${serverProcess.pid}`);
  log(`Using environment: NODE_ENV=${process.env.NODE_ENV}, MCP_NAME=${process.env.MCP_NAME}`);
  log(`Test config path: ${process.cwd()}/.env.test`);
  
  // Log server output for debugging
  serverProcess.stdout.on('data', (data) => {
    log(`Server stdout: ${data.toString().trim()}`);
  });
  
  serverProcess.stderr.on('data', (data) => {
    log(`Server stderr: ${data.toString().trim()}`);
  });
  
  // Handle server process exit
  serverProcess.on('exit', (code, signal) => {
    log(`Server process exited with code ${code} and signal ${signal}`);
    logStream.end();
  });
  
  // Send a simple initialization message
  const initMessage = {
    jsonrpc: '2.0',
    method: 'mcp.initialize',
    params: {
      protocol_version: '2024-11-05',
      client_name: 'simple-stdio-test',
      client_version: '1.0.0'
    },
    id: 1
  };
  
  log(`Sending initialization message: ${JSON.stringify(initMessage)}`);
  serverProcess.stdin.write(JSON.stringify(initMessage) + '\n');
  
  // Keep the process running for a bit to collect logs
  setTimeout(() => {
    log('Test timeout reached, terminating server');
    serverProcess.kill();
    logStream.end();
  }, 5000);
}

// Run the test
runSimpleTest().catch((error) => {
  log(`Error running test: ${error}`);
  process.exit(1);
});
