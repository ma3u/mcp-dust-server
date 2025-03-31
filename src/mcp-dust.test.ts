import { config } from 'dotenv';
import fetch from 'node-fetch';
import * as EventSource from 'eventsource';

// Load environment variables
config();

class DustMCPClient {
  private host: string;
  private port: number;
  private baseUrl: string;

  constructor() {
    this.host = process.env.MCP_HOST || '127.0.0.1';
    this.port = parseInt(process.env.MCP_PORT || '5001');
    this.baseUrl = `http://${this.host}:${this.port}`;
    
    console.log(`Connecting to MCP server at: ${this.baseUrl}`);
  }

  async runTest() {
    try {
      console.log('Establishing SSE connection...');
      
      // Create EventSource with proper type handling
      const es = new (EventSource as any)(`${this.baseUrl}/sse`);
      
      // Track the complete response
      let fullResponse = '';
      
      // Wait for endpoint event
      const messagesEndpoint = await new Promise<string>((resolve, reject) => {
        es.addEventListener('endpoint', (event: any) => {
          console.log(`Received endpoint: ${event.data}`);
          resolve(event.data);
        });
        
        es.onerror = (error: any) => {
          console.error('SSE connection error:', error);
          reject(error);
        };
        
        setTimeout(() => reject(new Error('Connection timeout')), 5000);
      });
      
      // Initialize connection
      console.log(`Initializing connection via ${messagesEndpoint}`);
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
              name: 'cognitive-systems-test',
              version: '0.0.1'
            }
          }
        })
      });
      
      const initResult = await initResponse.json();
      console.log('Initialization completed:', initResult);
      
      // Send the test query about systems thinking
      console.log('Sending cognitive neuroscience analysis query...');
      const queryResponse = await fetch(`${this.baseUrl}${messagesEndpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'executeToolCall',
          params: {
            toolCall: {
              id: 'systems-query-1',
              name: 'query',
              parameters: {
                prompt: 'Use SystemsThinking Agent to analyze our current architecture and suggest improvements based on cognitive neuroscience principles.'
              }
            }
          }
        })
      });
      
      const queryResult = await queryResponse.json();
      console.log('Query sent successfully:', queryResult);
      
      // Process streaming responses
      es.addEventListener('message', (event: any) => {
        try {
          const data = JSON.parse(event.data);
          
          // Extract content from tool call results
          if (data.method === 'partialToolCallResult' || data.method === 'finalToolCallResult') {
            if (data.params?.result?.content) {
              const content = data.params.result.content;
              fullResponse += content;
              console.log(`Received content chunk (${content.length} chars)`);
            }
          }
        } catch (error) {
          console.error('Error processing message:', error);
        }
      });
      
      // Wait for complete response
      console.log('Waiting for complete response (30 seconds)...');
      await new Promise(resolve => setTimeout(resolve, 30000));
      
      // Display final response
      console.log('\n===== SYSTEMS THINKING ANALYSIS RESPONSE =====');
      console.log(fullResponse || 'No response received');
      console.log('=====            END OF RESPONSE          =====\n');
      
      es.close();
      console.log('MCP connection closed');
    } catch (error) {
      console.error('Test failed:', error);
    }
  }
}

// Execute the test
const client = new DustMCPClient();
client.runTest();
