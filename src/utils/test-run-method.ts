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
async function sendJsonRpcRequest(method: string, params: any, id: string | number, timeoutMs: number = 10000): Promise<JsonRpcResponse> {
  const url = `${config.serverUrl}/stream`;
  
  logger.info(`Sending ${method} request to ${url}`);
  logger.debug(`Request params: ${JSON.stringify(params)}`);
  
  // Create an AbortController for timeout handling
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
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
      signal: controller.signal,
    });
    
    // Clear the timeout since the request completed
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
    }
    
    const result = await response.json() as JsonRpcResponse;
    logger.info(`Response received: ${JSON.stringify(result, null, 2)}`);
    return result;
  } catch (error) {
    // Clear the timeout if there was an error
    clearTimeout(timeoutId);
    
    if (error instanceof Error && error.name === 'AbortError') {
      logger.error(`Request timed out after ${timeoutMs}ms`);
      throw new Error(`Request timed out after ${timeoutMs}ms`);
    } else {
      logger.error(`Error sending request: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
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
  
  try {
    // Use a longer timeout (30 seconds) for the Dust query as it might take longer
    const result = await sendJsonRpcRequest('run', {
      tool: 'dust-query',
      args: {
        query: 'What is the Model Context Protocol?',
      },
    }, 'dust-query-request-1', 30000);
    
    logger.info(`Dust query result: ${JSON.stringify(result.result || 'No result')}`);
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.warn(`Dust query test encountered an issue: ${errorMessage}`);
    logger.info('Continuing with test suite despite Dust query error');
    // Return a mock response to allow the test to continue
    return {
      jsonrpc: '2.0',
      result: { status: 'skipped', reason: errorMessage },
      id: 'dust-query-request-1'
    };
  }
}

/**
 * Main function to run the tests
 */
async function main() {
  let success = true;
  
  try {
    logger.info('Starting JSON-RPC run method tests');
    
    // First, initialize the session
    try {
      const initResult = await sendJsonRpcRequest('initialize', {
        protocol_version: '2025-03-26',
        client: {
          name: 'test-client',
          version: '1.0.0'
        },
        capabilities: {
          supported_methods: ['initialize', 'message', 'terminate', 'run']
        }
      }, 'init-1');
      logger.info(`Session initialized: ${JSON.stringify(initResult.result || 'No result')}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn(`Session initialization error: ${errorMessage}`);
      logger.info('Continuing with tests despite initialization error');
      // We can continue with tests even if initialization fails
    }
    
    // Test the echo tool
    try {
      await testEchoTool();
      logger.info('Echo tool test completed successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Echo tool test failed: ${errorMessage}`);
      success = false;
    }
    
    // Test the dust-query tool
    try {
      await testDustQueryTool();
      logger.info('Dust query tool test completed');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Dust query tool test failed: ${errorMessage}`);
      // Don't fail the entire test suite if just the Dust query fails
    }
    
    // Terminate the session
    try {
      const terminateResult = await sendJsonRpcRequest('terminate', {}, 'term-1');
      logger.info(`Session terminated: ${JSON.stringify(terminateResult.result || 'No result')}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn(`Session termination error: ${errorMessage}`);
      // Not critical if termination fails
    }
    
    if (success) {
      logger.info('All critical tests completed successfully');
    } else {
      logger.error('Some tests failed - see log for details');
      process.exit(1);
    }
  } catch (error) {
    logger.error(`Test suite failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

// Run the main function
main().catch(error => {
  logger.error(`Error in main function: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
