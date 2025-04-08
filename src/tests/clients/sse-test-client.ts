/**
 * @fileoverview SSE Test Client for MCP Server
 * 
 * This module implements a test client for the Server-Sent Events (SSE) transport.
 * It can be used to test the MCP server's SSE transport implementation.
 * 
 * @author Ma3u
 * @project P4XAI
 * @jira P4XAI-50
 */

import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import readline from 'readline';
import { EventSource } from 'eventsource';

/**
 * Test client for the SSE transport
 */
class SseTestClient {
  private baseUrl: string;
  private sessionId: string;
  private messageCounter: number = 0;
  private eventSource: EventSource | null = null;
  private connected: boolean = false;

  /**
   * Creates a new SSE test client
   * @param baseUrl - Base URL of the MCP server (default: http://localhost:5001)
   * @param sessionId - Optional session ID (generated if not provided)
   */
  constructor(baseUrl: string = 'http://localhost:5001', sessionId?: string) {
    this.baseUrl = baseUrl;
    this.sessionId = sessionId || uuidv4();
    console.log(`SSE Test Client created with session ID: ${this.sessionId}`);
    console.log(`Server URL: ${this.baseUrl}`);
  }

  /**
   * Checks if the server is available
   * @returns Promise that resolves to true if the server is available
   */
  public async checkServer(): Promise<boolean> {
    try {
      const response = await axios.get(`${this.baseUrl}/health`);
      console.log('Server health check response:', response.data);
      return response.status === 200;
    } catch (error) {
      console.error('Server health check failed:', error);
      return false;
    }
  }

  /**
   * Connects to the server using SSE
   * @returns Promise that resolves when the connection is established
   */
  public async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        if (this.connected) {
          console.log('Already connected to SSE endpoint');
          resolve();
          return;
        }
        
        console.log(`Connecting to SSE endpoint: ${this.baseUrl}/sse`);
        
        // Create EventSource
        // Note: Standard EventSource doesn't support custom headers
        // In a real implementation, we would use a custom EventSource implementation
        // or append the session ID as a query parameter
        const url = new URL(`${this.baseUrl}/sse`);
        url.searchParams.append('sessionId', this.sessionId);
        
        this.eventSource = new EventSource(url.toString());
        
        // Handle connection open
        this.eventSource.onopen = () => {
          console.log('SSE connection established');
          this.connected = true;
          resolve();
        };
        
        // Handle messages
        this.eventSource.onmessage = (event) => {
          try {
            console.log('\nReceived SSE message:');
            
            try {
              // Try to parse as JSON for pretty printing
              const data = JSON.parse(event.data);
              console.log(JSON.stringify(data, null, 2));
            } catch {
              // If not valid JSON, just print the raw data
              console.log(event.data);
            }
          } catch (error) {
            console.error('Error processing SSE message:', error);
          }
        };
        
        // Handle specific event types
        this.eventSource.addEventListener('message', (event: any) => {
          try {
            console.log('\nReceived message event:');
            
            try {
              // Try to parse as JSON for pretty printing
              const data = JSON.parse(event.data);
              console.log(JSON.stringify(data, null, 2));
            } catch {
              // If not valid JSON, just print the raw data
              console.log(event.data);
            }
          } catch (error) {
            console.error('Error processing message event:', error);
          }
        });
        
        this.eventSource.addEventListener('heartbeat', (event: any) => {
          try {
            console.log('\nReceived heartbeat:');
            
            try {
              // Try to parse as JSON for pretty printing
              const data = JSON.parse(event.data);
              console.log(JSON.stringify(data, null, 2));
            } catch {
              // If not valid JSON, just print the raw data
              console.log(event.data);
            }
          } catch (error) {
            console.error('Error processing heartbeat:', error);
          }
        });
        
        // Handle errors
        this.eventSource.onerror = (error) => {
          console.error('SSE connection error:', error);
          
          if (!this.connected) {
            reject(new Error('Failed to establish SSE connection'));
          }
        };
      } catch (error) {
        console.error('Error connecting to SSE endpoint:', error);
        reject(error);
      }
    });
  }

  /**
   * Sends an initialize request to the server
   * @returns Promise that resolves to the server response
   */
  public async initialize(): Promise<any> {
    const message = {
      jsonrpc: "2.0",
      method: "initialize",
      params: {
        protocol_version: "2024-11-05",
        client: {
          name: "SSE Test Client",
          version: "1.0.0"
        }
      },
      id: this.getNextMessageId()
    };
    
    return this.sendMessage(message);
  }

  /**
   * Sends a message to the server
   * @param message - The message to send
   * @returns Promise that resolves to the server response
   */
  public async sendMessage(message: any): Promise<any> {
    try {
      console.log('\nSending to server:');
      console.log(JSON.stringify(message, null, 2));
      
      const response = await axios.post(`${this.baseUrl}/messages`, message, {
        headers: {
          'Content-Type': 'application/json',
          'Mcp-Session-Id': this.sessionId
        }
      });
      
      // For SSE, the response will come through the event source
      // This is just the HTTP response to the POST request
      console.log('\nHTTP response:');
      console.log(JSON.stringify(response.data, null, 2));
      
      return response.data;
    } catch (error: any) {
      console.error('Error sending message:', error.message);
      if (error.response) {
        console.error('Server response:', error.response.data);
      }
      throw error;
    }
  }

  /**
   * Sends a text message to the server
   * @param text - Text content of the message
   * @returns Promise that resolves to the server response
   */
  public async sendTextMessage(text: string): Promise<any> {
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
    
    return this.sendMessage(message);
  }

  /**
   * Sends a tool call to the server
   * @param toolName - Name of the tool to call
   * @param params - Tool parameters
   * @returns Promise that resolves to the server response
   */
  public async sendToolCall(toolName: string, params: any): Promise<any> {
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
    
    return this.sendMessage(message);
  }

  /**
   * Sends a terminate request to the server
   * @returns Promise that resolves to the server response
   */
  public async terminate(): Promise<any> {
    const message = {
      jsonrpc: "2.0",
      method: "terminate",
      params: {},
      id: this.getNextMessageId()
    };
    
    return this.sendMessage(message);
  }

  /**
   * Disconnects from the server
   */
  public disconnect(): void {
    if (this.eventSource) {
      console.log('Closing SSE connection');
      this.eventSource.close();
      this.eventSource = null;
      this.connected = false;
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

  /**
   * Gets the session ID for this client
   * @returns The session ID
   */
  public getSessionId(): string {
    return this.sessionId;
  }
}

// Run the test client if this is the entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const baseUrl = args[0] || 'http://localhost:5001';
  
  const client = new SseTestClient(baseUrl);
  
  // Handle process termination
  process.on('SIGINT', () => {
    console.log('\nReceived SIGINT, disconnecting...');
    client.disconnect();
    process.exit(0);
  });
  
  // Start the client and run a basic test
  client.checkServer()
    .then(available => {
      if (!available) {
        console.error('Server is not available. Please make sure the MCP server is running.');
        process.exit(1);
      }
      
      return client.connect();
    })
    .then(() => client.initialize())
    .then(() => {
      // Set up readline interface for user input
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      console.log('\n=== SSE Test Client ===');
      console.log('Type a message to send to the server, or use one of these commands:');
      console.log('  /echo <message>  - Call the echo tool with the given message');
      console.log('  /dust <query>    - Call the dust-query tool with the given query');
      console.log('  /exit            - Terminate the session and exit');
      console.log('=============================\n');
      
      const promptUser = () => {
        rl.question('> ', async (input) => {
          try {
            if (input.trim() === '/exit') {
              await client.terminate();
              client.disconnect();
              rl.close();
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
      console.error('Error running SSE test client:', error);
      process.exit(1);
    });
}

export { SseTestClient };
