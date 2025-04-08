/**
 * @fileoverview Advanced STDIO Transport Test Script
 * 
 * This script provides a comprehensive test suite for the STDIO transport
 * implementation, focusing on Claude Desktop compatibility.
 * 
 * @author Ma3u
 * @project P4XAI
 * @jira P4XAI-50
 */

import { spawn, ChildProcess } from 'child_process';
import readline from 'readline';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import chalk from 'chalk';

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the compiled STDIO server script
const STDIO_SERVER_PATH = path.resolve(__dirname, '../../dist/mcp-server/stdio-server.js');

// Message ID counter
let messageCounter = 0;

// Test session ID
const SESSION_ID = uuidv4();

// Log file path
const LOG_DIR = path.resolve(__dirname, '../../logs');
const LOG_FILE = path.resolve(LOG_DIR, `stdio-test-${new Date().toISOString().replace(/:/g, '-')}.log`);

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// Create log file stream
const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });

/**
 * Logs a message to console and file
 * @param message - Message to log
 * @param type - Log type (info, error, request, response)
 */
function log(message: string, type: 'info' | 'error' | 'request' | 'response' = 'info'): void {
  const timestamp = new Date().toISOString();
  let formattedMessage: string;
  
  switch (type) {
    case 'info':
      formattedMessage = chalk.blue(`[INFO] ${message}`);
      break;
    case 'error':
      formattedMessage = chalk.red(`[ERROR] ${message}`);
      break;
    case 'request':
      formattedMessage = chalk.green(`[REQUEST] ${message}`);
      break;
    case 'response':
      formattedMessage = chalk.yellow(`[RESPONSE] ${message}`);
      break;
  }
  
  console.log(formattedMessage);
  logStream.write(`[${timestamp}] [${type.toUpperCase()}] ${message}\n`);
}

/**
 * Gets the next message ID
 * @returns A unique message ID
 */
function getNextMessageId(): string {
  return `${messageCounter++}`;
}

/**
 * Formats a JSON object for display
 * @param obj - Object to format
 * @returns Formatted string
 */
function formatJson(obj: any): string {
  return JSON.stringify(obj, null, 2);
}

/**
 * Starts the STDIO server process
 * @returns The server process and readline interface
 */
function startServer(): { process: ChildProcess; rl: readline.Interface } {
  log(`Starting STDIO server process: ${STDIO_SERVER_PATH}`, 'info');
  
  // Spawn the STDIO server process
  const serverProcess = spawn('node', [STDIO_SERVER_PATH], {
    stdio: ['pipe', 'pipe', 'inherit'],
    env: {
      ...process.env,
      MCP_SESSION_ID: SESSION_ID,
      NODE_ENV: 'development',
      DEBUG: 'mcp:*'
    }
  });
  
  // Create readline interface for reading server output
  const rl = readline.createInterface({
    input: serverProcess.stdout!,
    terminal: false
  });
  
  // Handle server output
  rl.on('line', (line) => {
    try {
      if (!line.trim()) return;
      
      try {
        // Try to parse as JSON for pretty printing
        const message = JSON.parse(line);
        log(formatJson(message), 'response');
      } catch {
        // If not valid JSON, just print the raw line
        log(line, 'response');
      }
    } catch (error) {
      log(`Error processing server output: ${error}`, 'error');
    }
  });
  
  // Handle server process exit
  serverProcess.on('exit', (code: number | null) => {
    log(`STDIO server process exited with code ${code}`, 'info');
    rl.close();
  });
  
  // Handle server process error
  serverProcess.on('error', (error: Error) => {
    log(`STDIO server process error: ${error}`, 'error');
  });
  
  return { process: serverProcess, rl };
}

/**
 * Sends a message to the server
 * @param serverProcess - Server process to send to
 * @param message - Message to send
 */
function sendMessage(serverProcess: ChildProcess, message: any): void {
  try {
    const json = JSON.stringify(message);
    log(formatJson(message), 'request');
    
    // Write to the server's stdin
    serverProcess.stdin!.write(json + '\n');
  } catch (error) {
    log(`Error sending message: ${error}`, 'error');
  }
}

/**
 * Sends an initialize request to the server
 * @param serverProcess - Server process to send to
 */
function initialize(serverProcess: ChildProcess): void {
  const message = {
    jsonrpc: "2.0",
    method: "initialize",
    params: {
      protocol_version: "2024-11-05",
      client: {
        name: "STDIO Transport Test",
        version: "1.0.0"
      }
    },
    id: getNextMessageId()
  };
  
  sendMessage(serverProcess, message);
}

/**
 * Sends a text message to the server
 * @param serverProcess - Server process to send to
 * @param text - Text content of the message
 */
function sendTextMessage(serverProcess: ChildProcess, text: string): void {
  const message = {
    jsonrpc: "2.0",
    method: "message",
    params: {
      message: {
        role: "user",
        content: [
          {
            type: "text",
            text
          }
        ]
      }
    },
    id: getNextMessageId()
  };
  
  sendMessage(serverProcess, message);
}

/**
 * Sends a tool call to the server
 * @param serverProcess - Server process to send to
 * @param toolName - Name of the tool to call
 * @param params - Tool parameters
 */
function sendToolCall(serverProcess: ChildProcess, toolName: string, params: any): void {
  const message = {
    jsonrpc: "2.0",
    method: "message",
    params: {
      message: {
        role: "user",
        content: [
          {
            type: "tool_call",
            tool_call: {
              name: toolName,
              parameters: params
            }
          }
        ]
      }
    },
    id: getNextMessageId()
  };
  
  sendMessage(serverProcess, message);
}

/**
 * Sends a terminate request to the server
 * @param serverProcess - Server process to send to
 */
function terminate(serverProcess: ChildProcess): void {
  const message = {
    jsonrpc: "2.0",
    method: "terminate",
    params: {},
    id: getNextMessageId()
  };
  
  sendMessage(serverProcess, message);
}

/**
 * Runs a comprehensive test suite for the STDIO transport
 */
async function runTests(): Promise<void> {
  log('Starting STDIO transport test suite', 'info');
  log(`Session ID: ${SESSION_ID}`, 'info');
  log(`Log file: ${LOG_FILE}`, 'info');
  
  // Start the server
  const { process: serverProcess, rl } = startServer();
  
  // Wait for server to start
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Set up user input interface
  const userRl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  log('\n=== STDIO Transport Test ===', 'info');
  log('Available commands:', 'info');
  log('  init            - Send initialize request', 'info');
  log('  msg <text>      - Send text message', 'info');
  log('  echo <message>  - Call the echo tool', 'info');
  log('  dust <query>    - Call the dust-query tool', 'info');
  log('  term            - Send terminate request', 'info');
  log('  exit            - Exit the test', 'info');
  log('  help            - Show this help', 'info');
  log('============================', 'info');
  
  // Handle user input
  const promptUser = () => {
    userRl.question('> ', async (input) => {
      try {
        const command = input.trim();
        
        if (command === 'init') {
          initialize(serverProcess);
        } else if (command.startsWith('msg ')) {
          const text = command.substring(4).trim();
          sendTextMessage(serverProcess, text);
        } else if (command.startsWith('echo ')) {
          const message = command.substring(5).trim();
          sendToolCall(serverProcess, 'echo', { message });
        } else if (command.startsWith('dust ')) {
          const query = command.substring(5).trim();
          sendToolCall(serverProcess, 'dust-query', { query });
        } else if (command === 'term') {
          terminate(serverProcess);
        } else if (command === 'exit') {
          terminate(serverProcess);
          setTimeout(() => {
            serverProcess.kill();
            userRl.close();
            rl.close();
            logStream.end();
            process.exit(0);
          }, 500);
          return;
        } else if (command === 'help') {
          log('Available commands:', 'info');
          log('  init            - Send initialize request', 'info');
          log('  msg <text>      - Send text message', 'info');
          log('  echo <message>  - Call the echo tool', 'info');
          log('  dust <query>    - Call the dust-query tool', 'info');
          log('  term            - Send terminate request', 'info');
          log('  exit            - Exit the test', 'info');
          log('  help            - Show this help', 'info');
        } else {
          log('Unknown command. Type "help" for available commands.', 'error');
        }
        
        // Prompt again
        promptUser();
      } catch (error) {
        log(`Error processing input: ${error}`, 'error');
        promptUser();
      }
    });
  };
  
  // Handle process termination
  process.on('SIGINT', async () => {
    log('\nReceived SIGINT, stopping test...', 'info');
    terminate(serverProcess);
    setTimeout(() => {
      serverProcess.kill();
      userRl.close();
      rl.close();
      logStream.end();
      process.exit(0);
    }, 500);
  });
  
  // Start the prompt loop
  promptUser();
}

// Run the tests if this is the entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch(error => {
    log(`Error running STDIO transport test: ${error}`, 'error');
    process.exit(1);
  });
}

export {
  startServer,
  sendMessage,
  initialize,
  sendTextMessage,
  sendToolCall,
  terminate
};
