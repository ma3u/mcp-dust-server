/**
 * Test script for the JSON-RPC "run" method in the HTTP Stream transport
 * This script sends a direct tool execution request to the MCP server
 */

import fetch from 'node-fetch';
import * as dotenv from 'dotenv';
import { logger } from './secure-logger.js';
import crypto from 'crypto';

// Define types for JSON-RPC requests and responses
type JsonRpcRequest = {
  jsonrpc: string;
  method: string;
  params: any;
  id: string | number;
};

type JsonRpcResponse = {
  jsonrpc: string;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
  id: string | number | null;
};

// Load environment variables
dotenv.config();

// Configuration
const config = {
  serverUrl: process.env.MCP_SERVER_URL || 'http://127.0.0.1:5001',
  sessionId: crypto.randomUUID(), // Generate a unique session ID for this test
};

/**
 * Send a JSON-RPC request to the server
 * @param method The JSON-RPC method to call
 * @param params The parameters for the method
 * @param id The request ID
 * @returns The JSON-RPC response
 */
async function sendJsonRpcRequest(method: string, params: any, id: string | number): Promise<JsonRpcResponse> {
  const url = `${config.serverUrl}/stream`;
  
  logger.info(`Sending ${method} request to ${url}`);
  logger.debug(`Request params: ${JSON.stringify(params)}`);
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Mcp-Session-Id': config.sessionId,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method,
        params,
        id,
      }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
    }
    
    const result = await response.json() as JsonRpcResponse;
    logger.info(`Response received: ${JSON.stringify(result, null, 2)}`);
    return result;
  } catch (error) {
    logger.error(`Error sending request: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

/**
 * Test the echo tool
 * @returns The JSON-RPC response from the echo tool
 */
async function testEchoTool(): Promise<JsonRpcResponse> {
  logger.info('=== Testing Echo Tool ===');
  
  const result = await sendJsonRpcRequest('run', {
    tool: 'echo',
    args: {
      message: 'Hello from the test client!',
    },
  }, 'echo-request-1');
  
  logger.info(`Echo result: ${JSON.stringify(result.result || 'No result')}`);
  return result;
}

/**
 * Test the dust-query tool
 * @returns The JSON-RPC response from the dust-query tool
 */
async function testDustQueryTool(): Promise<JsonRpcResponse> {
  logger.info('=== Testing Dust Query Tool ===');
  
  const result = await sendJsonRpcRequest('run', {
    tool: 'dust-query',
    args: {
      query: 'What is the Model Context Protocol?',
    },
  }, 'dust-query-request-1');
  
  logger.info(`Dust query result: ${JSON.stringify(result.result || 'No result')}`);
  return result;
}

/**
 * Main function to run the tests
 */
async function main() {
  try {
    logger.info('Starting JSON-RPC run method tests');
    
    // First, initialize the session
    const initResult = await sendJsonRpcRequest('initialize', {}, 'init-1');
    logger.info(`Session initialized: ${JSON.stringify(initResult.result || 'No result')}`);
    
    // Test the echo tool
    await testEchoTool();
    
    // Test the dust-query tool
    await testDustQueryTool();
    
    // Terminate the session
    const terminateResult = await sendJsonRpcRequest('terminate', {}, 'term-1');
    logger.info(`Session terminated: ${JSON.stringify(terminateResult.result || 'No result')}`);
    
    logger.info('All tests completed successfully');
  } catch (error) {
    logger.error(`Test failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

// Run the main function
main().catch(error => {
  logger.error(`Error in main function: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
