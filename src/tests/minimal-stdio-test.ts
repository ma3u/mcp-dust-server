/**
 * Minimal STDIO test for MCP Server
 * This is a minimal test that directly uses the StdioServerTransport class
 */

import * as dotenv from 'dotenv';
import { Readable, Writable } from 'stream';
import { StdioServerTransport } from '../utils/stdio-transport.js';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/secure-logger.js';
import * as fs from 'fs';
import * as path from 'path';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Configure logging
const LOG_DIR = path.join(process.cwd(), 'logs');
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

const LOG_FILE = path.join(LOG_DIR, `minimal-stdio-test-${new Date().toISOString().replace(/:/g, '-')}.log`);
const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });

// Helper function to log messages
function log(message: string): void {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  console.error(logMessage); // Use stderr to avoid interfering with stdio transport
  logStream.write(logMessage + '\n');
}

// Create mock stdin and stdout streams
class MockReadable extends Readable {
  constructor() {
    super();
  }
  
  _read() {}
  
  pushData(data: string) {
    this.push(data);
  }
}

class MockWritable extends Writable {
  data: string[] = [];
  
  constructor() {
    super();
  }
  
  _write(chunk: any, encoding: string, callback: (error?: Error | null) => void): void {
    const data = chunk.toString();
    this.data.push(data);
    log(`Received: ${data}`);
    callback();
  }
}

// Test function
async function runMinimalTest(): Promise<void> {
  try {
    log('Starting minimal STDIO test');
    log(`Using environment: NODE_ENV=${process.env.NODE_ENV}, MCP_NAME=${process.env.MCP_NAME}`);
    
    // Create mock streams
    const mockStdin = new MockReadable();
    const mockStdout = new MockWritable();
    const sessionId = uuidv4();
    
    // Create StdioServerTransport instance
    log(`Creating StdioServerTransport with session ID: ${sessionId}`);
    const transport = new StdioServerTransport(mockStdin, mockStdout, sessionId);
    
    // Register message handler
    transport.onMessage = async (message: any) => {
      log(`Received message: ${JSON.stringify(message)}`);
      
      // Simple echo response
      if (message.method === 'mcp.initialize') {
        const response = {
          jsonrpc: '2.0',
          result: {
            protocol_version: '2024-11-05',
            server_name: process.env.MCP_NAME || 'Dust MCP Server TS',
            server_version: '1.0.0'
          },
          id: message.id
        };
        
        log(`Sending response: ${JSON.stringify(response)}`);
        await transport.send(response);
      }
    };
    
    // Send a test message
    const initMessage = {
      jsonrpc: '2.0',
      method: 'mcp.initialize',
      params: {
        protocol_version: '2024-11-05',
        client_name: 'minimal-stdio-test',
        client_version: '1.0.0'
      },
      id: 1
    };
    
    log(`Pushing message to mock stdin: ${JSON.stringify(initMessage)}`);
    mockStdin.pushData(JSON.stringify(initMessage) + '\n');
    
    // Wait for a bit to let the message processing complete
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Close the transport
    log('Closing transport');
    await transport.close();
    
    log('Test completed successfully');
  } catch (error) {
    log(`Error in test: ${error instanceof Error ? error.message : String(error)}`);
    if (error instanceof Error && error.stack) {
      log(`Stack trace: ${error.stack}`);
    }
  } finally {
    logStream.end();
  }
}

// Run the test
runMinimalTest().catch(error => {
  console.error(`Unhandled error: ${error}`);
  process.exit(1);
});
