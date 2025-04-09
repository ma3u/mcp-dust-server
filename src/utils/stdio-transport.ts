/**
 * @fileoverview STDIO Transport for MCP Server
 * 
 * This module implements a STDIO transport for the MCP server,
 * allowing clients to connect via standard input/output streams.
 * This is particularly useful for desktop applications like Claude Desktop.
 * 
 * @author Ma3u
 * @project P4XAI
 * @jira P4XAI-50
 */

import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { logger } from "./secure-logger.js";
import { Readable, Writable } from "stream";
import readline from "readline";
import { v4 as uuidv4 } from "uuid";
import { EventEmitter } from "events";

/**
 * STDIO Transport implementation for MCP Server
 * Allows communication with clients via standard input/output streams
 */
export class StdioServerTransport extends EventEmitter implements Transport {
  private stdin: Readable;
  private stdout: Writable;
  private rl: readline.Interface;
  public sessionId: string;
  private isConnected: boolean = false;
  private messageBuffer: string[] = [];
  private onMessageCallback: ((message: any) => Promise<void>) | null = null;

  /**
   * Creates a new STDIO transport instance
   * @param stdin - Input stream (defaults to process.stdin)
   * @param stdout - Output stream (defaults to process.stdout)
   * @param sessionId - Optional session ID (generated if not provided)
   */
  constructor(
    stdin: Readable = process.stdin,
    stdout: Writable = process.stdout,
    sessionId?: string
  ) {
    super();
    this.stdin = stdin;
    this.stdout = stdout;
    this.sessionId = sessionId || uuidv4();
    
    // Create readline interface for parsing input
    this.rl = readline.createInterface({
      input: this.stdin,
      output: this.stdout,
      terminal: false
    });
    
    logger.info(`STDIO transport created with session ID: ${this.sessionId}`);
  }

  /**
   * Starts the transport
   * Required by the Transport interface
   */
  public async start(): Promise<void> {
    await this.connect();
  }

  /**
   * Connects the transport and starts listening for messages
   */
  public async connect(): Promise<void> {
    if (this.isConnected) {
      logger.warn("STDIO transport already connected");
      return;
    }
    
    this.isConnected = true;
    logger.info("STDIO transport connected");
    
    // Process any buffered messages
    if (this.messageBuffer.length > 0 && this.onMessageCallback) {
      const buffer = [...this.messageBuffer];
      this.messageBuffer = [];
      
      for (const message of buffer) {
        try {
          const parsed = JSON.parse(message);
          await this.onMessageCallback(parsed);
        } catch (error) {
          logger.error(`Error processing buffered message: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
    
    // Start listening for input
    this.rl.on("line", async (line) => {
      try {
        if (!line.trim()) return;
        
        logger.debug(`STDIO received: ${line}`);
        
        try {
          // Parse the JSON message safely
          const message = JSON.parse(line);
          
          // Create a new object with the session ID to avoid prototype issues
          const messageWithSession = {
            ...message,
            sessionId: this.sessionId
          };
          
          if (this.onMessageCallback) {
            await this.onMessageCallback(messageWithSession);
          } else {
            // Buffer the message if no callback is registered yet
            this.messageBuffer.push(line);
            logger.debug("Message buffered (no callback registered)");
          }
        } catch (error) {
          logger.error(`Error parsing JSON message: ${error instanceof Error ? error.message : String(error)}`);
          
          // Send error response for invalid JSON
          const errorResponse = {
            jsonrpc: "2.0",
            error: {
              code: -32700,
              message: "Parse error: Invalid JSON"
            },
            id: null
          };
          
          this.send(errorResponse);
        }
      } catch (error) {
        logger.error(`Error in STDIO line handler: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
    
    this.rl.on("close", () => {
      logger.info("STDIO transport closed");
      this.isConnected = false;
      this.emit("close");
    });
    
    this.rl.on("error", (error) => {
      logger.error(`STDIO transport error: ${error.message}`);
      this.emit("error", error);
    });
  }

  /**
   * Sends a message through the transport
   * @param message - The message to send
   */
  public async send(message: any): Promise<void> {
    try {
      // Ensure the message is serialized as JSON with proper object handling
      // Use a replacer function to handle any potential circular references or prototype issues
      const json = JSON.stringify(message, (key, value) => {
        // Return a plain object copy for any non-primitive values
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          return { ...value };
        }
        return value;
      });
      logger.debug(`STDIO sending: ${json}`);
      
      // Write to stdout with a newline
      this.stdout.write(`${json}\n`);
    } catch (error) {
      logger.error(`Error sending message via STDIO: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Closes the transport
   */
  public async close(): Promise<void> {
    if (!this.isConnected) {
      return;
    }
    
    logger.info("Closing STDIO transport");
    this.isConnected = false;
    
    // Close the readline interface
    this.rl.close();
    
    this.emit("close");
  }

  /**
   * Sets the message handler for the transport
   * @param callback - Function to call when a message is received
   */
  public set onMessage(callback: (message: any) => Promise<void>) {
    this.onMessageCallback = callback;
    
    // Process any buffered messages
    if (this.isConnected && this.messageBuffer.length > 0) {
      const buffer = [...this.messageBuffer];
      this.messageBuffer = [];
      
      for (const message of buffer) {
        try {
          // Parse the JSON message safely
          const parsed = JSON.parse(message);
          
          // Create a new object with the session ID to avoid prototype issues
          const parsedWithSession = {
            ...parsed,
            sessionId: this.sessionId
          };
          
          callback(parsedWithSession).catch((error) => {
            logger.error(`Error in message callback: ${error instanceof Error ? error.message : String(error)}`);
          });
        } catch (error) {
          logger.error(`Error processing buffered message: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
  }

  /**
   * Gets the session ID for this transport
   */
  public getSessionId(): string {
    return this.sessionId;
  }
}
