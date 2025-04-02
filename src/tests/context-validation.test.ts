// src/tests/context-validation.test.ts
import { describe, it, expect } from '@jest/globals';
import {
  validateInitializeRequest,
  validateMessageRequest,
  validateTerminateRequest,
  createValidationErrorResponse
} from '../schemas/context-validation.js';

describe('Context Validation', () => {
  it('should validate initialize request', () => {
    // Valid initialize request
    const validRequest = {
      jsonrpc: '2.0',
      method: 'initialize',
      params: {
        protocol_version: '2025-03-26',
        client: {
          name: 'Test Client',
          version: '1.0.0'
        }
      },
      id: 1
    };
    
    const validResult = validateInitializeRequest(validRequest);
    expect(validResult.success).toBe(true);
    
    // Invalid initialize request (missing protocol_version)
    const invalidRequest = {
      jsonrpc: '2.0',
      method: 'initialize',
      params: {
        client: {
          name: 'Test Client',
          version: '1.0.0'
        }
      },
      id: 1
    };
    
    const invalidResult = validateInitializeRequest(invalidRequest);
    expect(invalidResult.success).toBe(false);
    // Type assertion for TypeScript
    if (!invalidResult.success) {
      expect(invalidResult.error).toBeDefined();
    }
  });
  
  it('should validate message request', () => {
    // Valid message request with text content
    const validRequest = {
      jsonrpc: '2.0',
      method: 'message',
      params: {
        message: {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Hello, world!'
            }
          ]
        }
      },
      id: 2
    };
    
    const validResult = validateMessageRequest(validRequest);
    expect(validResult.success).toBe(true);
    
    // Valid message request with tool call
    const validToolRequest = {
      jsonrpc: '2.0',
      method: 'message',
      params: {
        message: {
          role: 'assistant',
          tool_calls: [
            {
              id: 'tool-1',
              name: 'echo',
              parameters: [
                {
                  name: 'message',
                  value: 'Hello, world!'
                }
              ]
            }
          ]
        }
      },
      id: 3
    };
    
    const validToolResult = validateMessageRequest(validToolRequest);
    expect(validToolResult.success).toBe(true);
    
    // Invalid message request (invalid role)
    const invalidRequest = {
      jsonrpc: '2.0',
      method: 'message',
      params: {
        message: {
          role: 'invalid-role',
          content: [
            {
              type: 'text',
              text: 'Hello, world!'
            }
          ]
        }
      },
      id: 4
    };
    
    const invalidResult = validateMessageRequest(invalidRequest);
    expect(invalidResult.success).toBe(false);
    // Type assertion for TypeScript
    if (!invalidResult.success) {
      expect(invalidResult.error).toBeDefined();
    }
  });
  
  it('should validate terminate request', () => {
    // Valid terminate request
    const validRequest = {
      jsonrpc: '2.0',
      method: 'terminate',
      params: {},
      id: 5
    };
    
    const validResult = validateTerminateRequest(validRequest);
    expect(validResult.success).toBe(true);
    
    // Valid terminate request without params
    const validRequestNoParams = {
      jsonrpc: '2.0',
      method: 'terminate',
      id: 6
    };
    
    const validResultNoParams = validateTerminateRequest(validRequestNoParams);
    expect(validResultNoParams.success).toBe(true);
    
    // Invalid terminate request (wrong method)
    const invalidRequest = {
      jsonrpc: '2.0',
      method: 'wrong-method',
      params: {},
      id: 7
    };
    
    const invalidResult = validateTerminateRequest(invalidRequest);
    expect(invalidResult.success).toBe(false);
    // Type assertion for TypeScript
    if (!invalidResult.success) {
      expect(invalidResult.error).toBeDefined();
    }
  });
  
  it('should create validation error response', () => {
    // Create a mock Zod error
    const mockError = {
      errors: [
        {
          code: 'invalid_type',
          expected: 'string',
          received: 'number',
          path: ['params', 'message', 'content', 0, 'text'],
          message: 'Expected string, received number'
        }
      ]
    };
    
    const errorResponse = createValidationErrorResponse(8, mockError as any);
    
    expect(errorResponse.jsonrpc).toBe('2.0');
    expect(errorResponse.error.code).toBe(-32600);
    expect(errorResponse.error.message).toBe('Invalid Request');
    expect(errorResponse.error.data.validation_errors).toEqual(mockError.errors);
    expect(errorResponse.id).toBe(8);
  });
});
