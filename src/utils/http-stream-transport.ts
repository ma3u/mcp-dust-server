// src/utils/http-stream-transport.ts
import express from 'express';
import { Request, Response } from 'express';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { logger } from './secure-logger.js';
import { sessionManager } from './session-manager.js';

/**
 * HTTP Stream Transport implementation for MCP
 * Provides bidirectional streaming via chunked encoding
 * Implements the Transport interface from the MCP SDK
 */
export class HTTPStreamTransport implements Transport {
  private messageHandler: ((message: any) => Promise<void>) | null = null;
  private response: Response;
  public sessionId: string;
  public path: string;
  private closed: boolean = false;

  /**
   * Create a new HTTP Stream Transport
   * @param path The endpoint path
   * @param res Express response object
   * @param sessionId Optional session ID
   */
  constructor(path: string, res: Response, sessionId?: string) {
    this.path = path;
    this.response = res;
    this.sessionId = sessionId || '';
    
    // Configure response headers for streaming
    this.response.setHeader('Content-Type', 'application/json');
    this.response.setHeader('Transfer-Encoding', 'chunked');
    this.response.setHeader('Connection', 'keep-alive');
    this.response.setHeader('Cache-Control', 'no-cache');
    
    // Set up connection close handler
    this.response.on('close', () => {
      logger.info(`HTTP Stream connection closed for path: ${this.path}`);
      this.closed = true;
    });
    
    // Start the response
    this.response.status(200);
    
    // If we have a session ID, associate this transport with it
    if (this.sessionId) {
      const session = sessionManager.getSession(this.sessionId);
      if (session) {
        logger.debug(`HTTP Stream transport associated with session: ${this.sessionId}`);
        sessionManager.updateSession(this.sessionId, { transportPath: this.path });
      }
    }
  }

  /**
   * Start the transport - required by Transport interface
   */
  async start(): Promise<void> {
    logger.debug(`HTTP Stream transport started: ${this.path}`);
    // Nothing to do here as we're using an existing Express response
    return Promise.resolve();
  }

  /**
   * Stop the transport - required by Transport interface
   */
  async stop(): Promise<void> {
    logger.debug(`HTTP Stream transport stopped: ${this.path}`);
    return this.close();
  }

  /**
   * Register a message handler
   * @param handler Function to handle incoming messages
   */
  onMessage(handler: (message: any) => Promise<void>): void {
    this.messageHandler = handler;
  }

  /**
   * Send a message through the transport
   * @param message Message to send
   */
  async send(message: any): Promise<void> {
    if (this.closed) {
      logger.warn(`Attempted to send message on closed HTTP Stream transport: ${this.path}`);
      return;
    }
    
    try {
      // Format the message as JSON and send as a chunk
      const messageJson = JSON.stringify(message);
      this.response.write(messageJson + '\n');
      
      // No need to call flush as it's not available on Express Response
      // The data will be sent automatically
      
      logger.debug(`Sent message on HTTP Stream transport: ${this.path}`);
    } catch (error) {
      logger.error(`Error sending message on HTTP Stream transport: ${error instanceof Error ? error.message : String(error)}`);
      await this.close();
    }
  }

  /**
   * Process an incoming message
   * @param message Message to process
   */
  async processMessage(message: any): Promise<void> {
    if (!this.messageHandler) {
      logger.warn(`No message handler registered for HTTP Stream transport: ${this.path}`);
      return;
    }
    
    try {
      await this.messageHandler(message);
    } catch (error) {
      logger.error(`Error processing message on HTTP Stream transport: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Close the transport
   */
  async close(): Promise<void> {
    if (!this.closed) {
      logger.info(`Closing HTTP Stream transport: ${this.path}`);
      
      try {
        // End the response
        this.response.end();
        this.closed = true;
        
        // If we have a session ID, update it
        if (this.sessionId) {
          sessionManager.updateSession(this.sessionId, { transportPath: null });
        }
      } catch (error) {
        logger.error(`Error closing HTTP Stream transport: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  /**
   * Create an HTTP Stream transport middleware for Express
   * @param path API endpoint path
   * @returns Express middleware function
   */
  static createMiddleware(path: string) {
    return async (req: Request, res: Response) => {
      try {
        // Extract session ID from request if available
        const sessionId = req.header('Mcp-Session-Id');
        
        // Create transport
        const transport = new HTTPStreamTransport(path, res, sessionId || undefined);
        
        // Process any incoming message in the request body
        if (req.body && Object.keys(req.body).length > 0) {
          await transport.processMessage(req.body);
        }
        
        // Keep the connection open for streaming
        // The connection will be closed when the client disconnects or when close() is called
      } catch (error) {
        logger.error(`Error in HTTP Stream middleware: ${error instanceof Error ? error.message : String(error)}`);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Internal Server Error' });
        }
      }
    };
  }
}
