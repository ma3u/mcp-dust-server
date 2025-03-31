// The class connects to an MCP server using environment variables from a .env file and follows the MCP protocol to establish a session, initialize communication, and send a query to the server.

import { config } from 'dotenv';
import fetch from 'node-fetch';
import EventSource from 'eventsource';

// Load environment variables from .env file
config();

class SystemsThinkingMCPTest {
  private host: string;
  private port: number;
  private baseUrl: string;
  private agentName: string;

  constructor() {
    // Load configuration from .env
    this.host = process.env.MCP_HOST || '127.0.0.1';
    this.port = parseInt(process.env.MCP_PORT || '5001');
    this.baseUrl = `http://${this.host}:${this.port}`;
    this.agentName = process.env.DUST_AGENT_NAME || 'SystemsThinking';
    
    console.log(`Configured MCP server at: ${this.baseUrl}`);
    console.log(`Using agent: ${this.agentName}`);
  }

  async runTest() {
    try {
      console.log(`Connecting to MCP server at ${this.baseUrl}/sse`);
      
      // 1. Connect to /sse endpoint to establish SSE connection
      const es = new EventSource(`${this.baseUrl}/sse`);
      
      // 2. Wait for the endpoint event that provides the messaging URL
      const messagesEndpoint = await new Promise<string>((resolve, reject) => {
        es.addEventListener('endpoint', (event: any) => {
          console.log(`Received endpoint: ${event.data}`);
          resolve(event.data);
        });
        
        es.onerror = (error: any) => {
          console.error('SSE connection error:', error);
          reject(error);
        };
        
        // Set a timeout for connection attempt
        setTimeout(() => {
          console.error('Timed out waiting for endpoint event');
          reject(new Error('Timeout waiting for endpoint event'));
        }, 5000);
      });
      
      // 3. Initialize the connection following MCP protocol
      console.log(`Initializing connection to ${messagesEndpoint}`);
      const initResponse = await fetch(`${this.baseUrl}${messagesEndpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 0,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {
              sampling: {},
              roots: { listChanged: true }
            },
            clientInfo: {
              name: 'systems-thinking-test',
              version: '0.0.1'
            }
          }
        })
      });
      
      const initResult = await initResponse.json();
      console.log('Initialization result:', initResult);
      
      // 4. Send the query about systems thinking topics
      console.log('Sending query about systems thinking, cognitive neuroscience, and problem-solving strategies');
      const queryResponse = await fetch(`${this.baseUrl}${messagesEndpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'executeToolCall',
          params: {
            toolCall: {
              id: 'query-1',
              name: 'query',
              parameters: {
                prompt: `Explain systems thinking, cognitive neuroscience, and problem-solving strategies.`
              }
            }
          }
        })
      });
      
      const queryResult = await queryResponse.json();
      console.log('Query result:', queryResult);
      
      // 5. Listen for additional messages from the server
      es.addEventListener('message', (event: any) => {
        console.log('Received message:', event.data);
        try {
          const data = JSON.parse(event.data);
          console.log('Parsed message:', data);
        } catch (error) {
          console.error('Failed to parse message as JSON:', error);
        }
      });
      
      // Wait for asynchronous messages
      console.log('Waiting for response stream (30 seconds)...');
      await new Promise(resolve => setTimeout(resolve, 30000));
      
      // 6. Close the connection
      es.close();
      console.log('Test completed');
    } catch (error) {
      console.error('Error:', error);
    }
  }
}

// Run the test
const test = new SystemsThinkingMCPTest();
test.runTest();
