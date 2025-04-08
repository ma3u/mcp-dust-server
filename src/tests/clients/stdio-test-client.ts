/**
 * @fileoverview STDIO Test Client for MCP Server
 * 
 * This module implements a test client for the STDIO transport.
 * It can be used to test the MCP server's STDIO transport implementation.
 * 
 * @author Ma3u
 * @project P4XAI
 * @jira P4XAI-50
 */

import { spawn } from 'child_process';
import readline from 'readline';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the STDIO server script
const STDIO_SERVER_PATH = path.resolve(__dirname, '../../mcp-server/stdio-server.js');

/**
 * Test client for the STDIO transport
 */
class StdioTestClient {
  private serverProcess: any;
  private rl: readline.Interface;
  private sessionId: string;
  private messageCounter: number = 0;

  /**
   * Creates a new STDIO test client
   * @param sessionId - Optional session ID (generated if not provided)
   */
  constructor(sessionId?: string) {
    this.sessionId = sessionId || uuidv4();
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    console.log(`STDIO Test Client created with session ID: ${this.sessionId}`);
  }

  /**
   * Starts the STDIO server process and connects to it
   */
  public async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        console.log(`Starting STDIO server process: ${STDIO_SERVER_PATH}`);
        
        // Spawn the STDIO server process
        this.serverProcess = spawn('node', [STDIO_SERVER_PATH], {
          stdio: ['pipe', 'pipe', 'inherit'],
          env: {
            ...process.env,
            MCP_SESSION_ID: this.sessionId
          }
        });
        
        // Create readline interface for reading server output
        this.rl = readline.createInterface({
          input: this.serverProcess.stdout,
          terminal: false
        });
        
        // Handle server output
        this.rl.on('line', (line) => {
          try {
            if (!line.trim()) return;
            
            console.log('\nReceived from server:');
            
            try {
              // Try to parse as JSON for pretty printing
              const message = JSON.parse(line);
              console.log(JSON.stringify(message, null, 2));
            } catch {
              // If not valid JSON, just print the raw line
              console.log(line);
            }
          } catch (error) {
            console.error('Error processing server output:', error);
          }
        });
        
        // Handle server process exit
        this.serverProcess.on('exit', (code: number) => {
          console.log(`STDIO server process exited with code ${code}`);
          this.rl.close();
        });
        
        // Handle server process error
        this.serverProcess.on('error', (error: Error) => {
          console.error('STDIO server process error:', error);
          reject(error);
        });
        
        // Wait a moment for the server to start
        setTimeout(() => {
          console.log('STDIO server started and ready for testing');
          resolve();
        }, 1000);
      } catch (error) {
        console.error('Failed to start STDIO server:', error);
        reject(error);
      }
    });
  }

  /**
   * Sends an initialize request to the server
   */
  public async initialize(): Promise<void> {
    const message = {
      jsonrpc: "2.0",
      method: "initialize",
      params: {
        protocol_version: "2024-11-05",
        client: {
          name: "STDIO Test Client",
          version: "1.0.0"
        }
      },
      id: this.getNextMessageId()
    };
    
    await this.sendMessage(message);
  }

  /**
   * Sends a message request to the server
   * @param content - Message content
   */
  public async sendMessage(message: any): Promise<void> {
    try {
      const json = JSON.stringify(message);
      console.log('\nSending to server:');
      console.log(JSON.stringify(message, null, 2));
      
      // Write to the server's stdin
      this.serverProcess.stdin.write(json + '\n');
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  }

  /**
   * Sends a text message to the server
   * @param text - Text content of the message
   */
  public async sendTextMessage(text: string): Promise<void> {
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
      id: this.getNextMessageId()
    };
    
    await this.sendMessage(message);
  }

  /**
   * Sends a tool call to the server
   * @param toolName - Name of the tool to call
   * @param params - Tool parameters
   */
  public async sendToolCall(toolName: string, params: any): Promise<void> {
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
      id: this.getNextMessageId()
    };
    
    await this.sendMessage(message);
  }

  /**
   * Sends a terminate request to the server
   */
  public async terminate(): Promise<void> {
    const message = {
      jsonrpc: "2.0",
      method: "terminate",
      params: {},
      id: this.getNextMessageId()
    };
    
    await this.sendMessage(message);
  }

  /**
   * Stops the client and the server process
   */
  public async stop(): Promise<void> {
    try {
      // Try to terminate gracefully first
      await this.terminate();
      
      // Give the server a moment to process the terminate request
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Close the readline interface
      this.rl.close();
      
      // Kill the server process if it's still running
      if (this.serverProcess && !this.serverProcess.killed) {
        this.serverProcess.kill();
      }
      
      console.log('STDIO test client stopped');
    } catch (error) {
      console.error('Error stopping STDIO test client:', error);
      throw error;
    }
  }

  /**
   * Gets the next message ID
   * @returns A unique message ID
   * @private
   */
  private getNextMessageId(): string {
    return `${this.messageCounter++}`;
  }
}

// Run the test client if this is the entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const client = new StdioTestClient();
  
  // Handle process termination
  process.on('SIGINT', async () => {
    console.log('\nReceived SIGINT, stopping client...');
    await client.stop();
    process.exit(0);
  });
  
  // Start the client and run a basic test
  client.start()
    .then(() => client.initialize())
    .then(() => {
      // Set up readline interface for user input
      const userRl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      console.log('\n=== STDIO Test Client ===');
      console.log('Type a message to send to the server, or use one of these commands:');
      console.log('  /echo <message>  - Call the echo tool with the given message');
      console.log('  /dust <query>    - Call the dust-query tool with the given query');
      console.log('  /exit            - Terminate the session and exit');
      console.log('=============================\n');
      
      const promptUser = () => {
        userRl.question('> ', async (input) => {
          try {
            if (input.trim() === '/exit') {
              await client.stop();
              userRl.close();
              process.exit(0);
            } else if (input.startsWith('/echo ')) {
              const message = input.substring(6).trim();
              await client.sendToolCall('echo', { message });
            } else if (input.startsWith('/dust ')) {
              const query = input.substring(6).trim();
              await client.sendToolCall('dust-query', { query });
            } else {
              await client.sendTextMessage(input);
            }
            
            // Prompt again after processing
            promptUser();
          } catch (error) {
            console.error('Error processing input:', error);
            promptUser();
          }
        });
      };
      
      // Start the prompt loop
      promptUser();
    })
    .catch(error => {
      console.error('Error running STDIO test client:', error);
      process.exit(1);
    });
}

export { StdioTestClient };
