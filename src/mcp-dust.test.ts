// Updated EventSource import and type assertion
import { config } from 'dotenv';
import fetch from 'node-fetch';
import EventSource from 'eventsource';

config();

class SystemsThinkingMCPTest {
  private host: string;
  private port: number;
  private baseUrl: string;
  private agentName: string;

  constructor() {
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
      
      // Corrected EventSource initialization
      const es = new (EventSource as unknown as {
        new(url: string, eventSourceInitDict?: EventSource.EventSourceInit): EventSource
      })(`${this.baseUrl}/sse`);

      // Wait for endpoint event
      const messagesEndpoint = await new Promise<string>((resolve, reject) => {
        es.addEventListener('endpoint', (event: MessageEvent) => {
          console.log(`Received endpoint: ${event.data}`);
          resolve(event.data);
        });

        es.onerror = (error: Event) => {
          console.error('SSE connection error:', error);
          reject(error);
        };

        setTimeout(() => {
          reject(new Error('Timeout waiting for endpoint event'));
        }, 5000);
      });

      // Initialize connection
      console.log(`Initializing connection to ${messagesEndpoint}`);
      const initResponse = await fetch(`${this.baseUrl}${messagesEndpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

      // Send query
      console.log('Sending query...');
      const queryResponse = await fetch(`${this.baseUrl}${messagesEndpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

      // Handle messages
      es.addEventListener('message', (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          console.log('Received message:', data);
        } catch (error) {
          console.error('JSON parse error:', error);
        }
      });

      console.log('Waiting for response stream (30 seconds)...');
      await new Promise(resolve => setTimeout(resolve, 30000));
      
      es.close();
      console.log('Test completed');
    } catch (error) {
      console.error('Test failed:', error);
    }
  }
}

// Execute the test
const test = new SystemsThinkingMCPTest();
test.runTest();
