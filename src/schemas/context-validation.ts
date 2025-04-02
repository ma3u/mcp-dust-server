// src/schemas/context-validation.ts
import { z } from 'zod';
import { logger } from '../utils/secure-logger.js';

/**
 * MCP message validation schemas
 * These schemas validate the structure of MCP messages
 * according to the MCP specification (2025-03-26)
 */

/**
 * Content block schema for text content
 */
export const textContentSchema = z.object({
  type: z.literal('text'),
  text: z.string()
});

/**
 * Content block schema for image content
 */
export const imageContentSchema = z.object({
  type: z.literal('image'),
  image_url: z.object({
    url: z.string().url(),
    detail: z.enum(['auto', 'low', 'high']).optional()
  })
});

/**
 * Content block schema for code content
 */
export const codeContentSchema = z.object({
  type: z.literal('code'),
  text: z.string(),
  language: z.string().optional()
});

/**
 * Combined content block schema
 */
export const contentBlockSchema = z.discriminatedUnion('type', [
  textContentSchema,
  imageContentSchema,
  codeContentSchema
]);

/**
 * Tool parameter schema
 */
export const toolParameterSchema = z.object({
  name: z.string(),
  value: z.any()
});

/**
 * Tool call schema
 */
export const toolCallSchema = z.object({
  id: z.string(),
  name: z.string(),
  parameters: z.array(toolParameterSchema).optional()
});

/**
 * Tool result schema
 */
export const toolResultSchema = z.object({
  call_id: z.string(),
  status: z.enum(['success', 'error']),
  content: z.array(contentBlockSchema).optional(),
  error: z.object({
    message: z.string(),
    code: z.string().optional()
  }).optional()
});

/**
 * Message schema
 */
export const messageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.array(contentBlockSchema).optional(),
  tool_calls: z.array(toolCallSchema).optional(),
  tool_results: z.array(toolResultSchema).optional()
});

/**
 * Initialize request schema
 */
export const initializeRequestSchema = z.object({
  jsonrpc: z.literal('2.0'),
  method: z.literal('initialize'),
  params: z.object({
    protocol_version: z.string(),
    client: z.object({
      name: z.string(),
      version: z.string()
    })
  }),
  id: z.number().or(z.string())
});

/**
 * Initialize response schema
 */
export const initializeResponseSchema = z.object({
  jsonrpc: z.literal('2.0'),
  result: z.object({
    protocol_version: z.string(),
    server: z.object({
      name: z.string(),
      version: z.string()
    }),
    capabilities: z.object({
      tools: z.array(z.string()).optional()
    }).optional()
  }),
  id: z.number().or(z.string())
});

/**
 * Message request schema
 */
export const messageRequestSchema = z.object({
  jsonrpc: z.literal('2.0'),
  method: z.literal('message'),
  params: z.object({
    message: messageSchema
  }),
  id: z.number().or(z.string())
});

/**
 * Message response schema
 */
export const messageResponseSchema = z.object({
  jsonrpc: z.literal('2.0'),
  result: z.object({
    message: messageSchema
  }),
  id: z.number().or(z.string())
});

/**
 * Terminate request schema
 */
export const terminateRequestSchema = z.object({
  jsonrpc: z.literal('2.0'),
  method: z.literal('terminate'),
  params: z.object({}).optional(),
  id: z.number().or(z.string())
});

/**
 * Terminate response schema
 */
export const terminateResponseSchema = z.object({
  jsonrpc: z.literal('2.0'),
  result: z.object({}),
  id: z.number().or(z.string())
});

/**
 * Error response schema
 */
export const errorResponseSchema = z.object({
  jsonrpc: z.literal('2.0'),
  error: z.object({
    code: z.number(),
    message: z.string(),
    data: z.any().optional()
  }),
  id: z.number().or(z.string()).nullable()
});

/**
 * Validate MCP message against schema
 * @param message Message to validate
 * @param schema Schema to validate against
 * @returns Validation result
 */
export function validateMessage<T>(message: any, schema: z.ZodType<T>): { success: true, data: T } | { success: false, error: z.ZodError } {
  try {
    const result = schema.parse(message);
    return { success: true, data: result };
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn(`Message validation failed: ${error.message}`);
      return { success: false, error };
    }
    throw error;
  }
}

/**
 * Validate MCP initialize request
 * @param message Message to validate
 * @returns Validation result
 */
export function validateInitializeRequest(message: any) {
  return validateMessage(message, initializeRequestSchema);
}

/**
 * Validate MCP message request
 * @param message Message to validate
 * @returns Validation result
 */
export function validateMessageRequest(message: any) {
  return validateMessage(message, messageRequestSchema);
}

/**
 * Validate MCP terminate request
 * @param message Message to validate
 * @returns Validation result
 */
export function validateTerminateRequest(message: any) {
  return validateMessage(message, terminateRequestSchema);
}

/**
 * Create error response for invalid message
 * @param id Message ID
 * @param error Validation error
 * @returns Error response
 */
export function createValidationErrorResponse(id: number | string | null, error: z.ZodError) {
  return {
    jsonrpc: '2.0',
    error: {
      code: -32600,
      message: 'Invalid Request',
      data: {
        validation_errors: error.errors
      }
    },
    id
  };
}
