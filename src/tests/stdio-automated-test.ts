/**
 * @fileoverview Automated tests for STDIO transport
 * 
 * This script performs automated testing of the STDIO transport implementation
 * by simulating client-server communication through pipes.
 * 
 * @author Ma3u
 * @project P4XAI
 */

import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/secure-logger.js';
import * as dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Log the environment being used
console.error(`Using test environment with MCP_NAME: ${process.env.MCP_NAME}`);

// Configure logging for tests
const LOG_DIR = path.join(process.cwd(), 'logs');
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

const LOG_FILE = path.join(LOG_DIR, `stdio-automated-test-${new Date().toISOString().replace(/:/g, '-')}.log`);
const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });

// Helper function to log messages to both console and file
function log(message: string): void {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  console.error(logMessage); // Use stderr to avoid interfering with stdio transport
  logStream.write(logMessage + '\n');
}

// Test timeout (ms)
const TEST_TIMEOUT = 30000;

// Test cases
interface TestCase {
  name: string;
  messages: any[];
  validateResponse: (response: any) => boolean;
  timeout?: number;
}

const testCases: TestCase[] = [
  {
    name: 'Basic initialization and termination',
    messages: [
      {
        jsonrpc: '2.0',
        method: 'mcp.initialize',
        params: {
          protocol_version: '2024-11-05',
          client_name: 'stdio-test-client',
          client_version: '1.0.0'
        },
        id: 1
      },
      {
        jsonrpc: '2.0',
        method: 'mcp.terminate',
        params: {},
        id: 2
      }
    ],
    validateResponse: (response) => {
      if (response.id === 1) {
        return response.jsonrpc === '2.0' && 
               response.result && 
               response.result.protocol_version === '2024-11-05' && 
               response.result.server_name === 'mcp-dust-server' && 
               typeof response.result.server_version === 'string';
      } else if (response.id === 2) {
        return response.jsonrpc === '2.0' && response.result && Object.keys(response.result).length === 0;
      }
      return false;
    }
  },
  {
    name: 'Echo tool test',
    messages: [
      {
        jsonrpc: '2.0',
        method: 'mcp.initialize',
        params: {
          protocol_version: '2024-11-05',
          client_name: 'stdio-test-client',
          client_version: '1.0.0'
        },
        id: 1
      },
      {
        jsonrpc: '2.0',
        method: 'mcp.tool_call',
        params: {
          name: 'echo',
          parameters: {
            message: 'Hello, MCP!'
          }
        },
        id: 2
      },
      {
        jsonrpc: '2.0',
        method: 'mcp.terminate',
        params: {},
        id: 3
      }
    ],
    validateResponse: (response) => {
      if (response.id === 1) {
        return response.jsonrpc === '2.0' && 
               response.result && 
               response.result.protocol_version === '2024-11-05' && 
               response.result.server_name === 'mcp-dust-server' && 
               typeof response.result.server_version === 'string';
      } else if (response.id === 2) {
        return response.jsonrpc === '2.0' && 
               response.result && 
               response.result.message === 'Hello, MCP!';
      } else if (response.id === 3) {
        return response.jsonrpc === '2.0' && response.result && Object.keys(response.result).length === 0;
      }
      return false;
    }
  }
];

// Start server process
function startServer(): ChildProcess {
  const serverProcess = spawn('node', ['--loader', 'ts-node/esm', 'src/mcp-server/stdio-server.ts'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, NODE_ENV: 'test' }
  });
  
  // Log server stderr for debugging
  serverProcess.stderr.on('data', (data) => {
    log(`Server stderr: ${data.toString()}`);
  });
  
  return serverProcess;
}

// Run a single test case
async function runTestCase(testCase: TestCase): Promise<boolean> {
  return new Promise((resolve) => {
    log(`Running test case: ${testCase.name}`);
    
    const server = startServer();
    const responses: any[] = [];
    let messageIndex = 0;
    let expectedResponseCount = testCase.messages.length;
    
    // Set test timeout
    const timeout = setTimeout(() => {
      log(`Test timed out: ${testCase.name}`);
      server.kill();
      resolve(false);
    }, testCase.timeout || TEST_TIMEOUT);
    
    // Process server stdout
    server.stdout?.on('data', (data) => {
      const lines = data.toString().split('\n').filter(Boolean);
      
      for (const line of lines) {
        try {
          const response = JSON.parse(line);
          log(`Received response: ${JSON.stringify(response)}`);
          responses.push(response);
          
          // Validate the response
          const isValid = testCase.validateResponse(response);
          if (!isValid) {
            log(`Validation failed for response: ${JSON.stringify(response)}`);
          }
          
          // Send next message if available
          if (messageIndex < testCase.messages.length) {
            const message = testCase.messages[messageIndex++];
            log(`Sending message: ${JSON.stringify(message)}`);
            server.stdin?.write(JSON.stringify(message) + '\n');
          }
          
          // Check if we've received all expected responses
          if (responses.length === expectedResponseCount) {
            clearTimeout(timeout);
            server.kill();
            
            // Check if all responses were valid
            const allValid = responses.every(r => testCase.validateResponse(r));
            log(`Test ${allValid ? 'passed' : 'failed'}: ${testCase.name}`);
            resolve(allValid);
          }
        } catch (error) {
          log(`Error parsing response: ${error}`);
        }
      }
    });
    
    // Send first message to start the test
    if (testCase.messages.length > 0) {
      const message = testCase.messages[messageIndex++];
      log(`Sending message: ${JSON.stringify(message)}`);
      server.stdin?.write(JSON.stringify(message) + '\n');
    }
  });
}

// Run all test cases
async function runAllTests(): Promise<void> {
  log('Starting STDIO automated tests');
  
  let passed = 0;
  let failed = 0;
  
  for (const testCase of testCases) {
    const success = await runTestCase(testCase);
    if (success) {
      passed++;
    } else {
      failed++;
    }
  }
  
  log(`Test summary: ${passed} passed, ${failed} failed`);
  
  // Close log stream
  logStream.end();
  
  // Exit with appropriate code
  process.exit(failed > 0 ? 1 : 0);
}

// Run tests if this is the main module
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  runAllTests().catch((error) => {
    log(`Error running tests: ${error}`);
    process.exit(1);
  });
}
