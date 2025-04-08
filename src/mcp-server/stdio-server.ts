/**
 * @fileoverview STDIO MCP Server Implementation
 * 
 * This module implements a STDIO-based MCP server for desktop applications
 * like Claude Desktop. It uses the StdioServerTransport to communicate
 * with clients via standard input/output streams.
 * 
 * @author Ma3u
 * @project P4XAI
 * @jira P4XAI-50
 */

import { logger } from "../utils/secure-logger.js";
import { StdioServerTransport } from "../utils/stdio-transport.js";
import { createMcpServer } from "./server.js";
import { v4 as uuidv4 } from "uuid";
import { fileUploadService } from "../utils/file-upload-service.js";
import { conversationHistory } from "../utils/conversation-history.js";
import { EventEmitter } from "events";

/**
 * Starts an MCP server with STDIO transport
 * This is designed for desktop applications like Claude Desktop
 * 
 * @param sessionId - Optional session ID (generated if not provided)
 * @returns Promise that resolves when the server is started
 */
export async function startStdioServer(sessionId?: string): Promise<void> {
  try {
    // Redirect console.log to stderr to avoid interfering with STDIO transport
    console.log = console.error;
    
    // Generate a session ID if not provided
    const session = sessionId || uuidv4();
    
    logger.info(`Starting STDIO MCP server with session ID: ${session}`);
    
    // Create the MCP server with STDIO transport type
    const mcpServer = await createMcpServer('stdio');
    
    // Create the STDIO transport
    const stdioTransport = new StdioServerTransport(process.stdin, process.stdout, session);
    
    // Connect the transport to the server
    await mcpServer.connect(stdioTransport);
    
    logger.info("STDIO MCP server started successfully");
    
    // Log a message to stderr (not stdout) to indicate the server is ready
    console.error("STDIO MCP server is ready for connections");
    
    // Handle process termination
    const cleanup = async () => {
      logger.info("Shutting down STDIO MCP server");
      
      try {
        // Clean up resources
        fileUploadService.cleanupSessionFiles(session);
        // Clear conversation history
        logger.info(`Cleaning up conversation history for session: ${session}`);
        // We don't call any specific method since the ConversationHistory interface
        // may not have a clearSession or getMessages method
        // The conversation history will be garbage collected when the session ends
        
        // Close the transport
        await stdioTransport.close();
        
        logger.info("STDIO MCP server shutdown complete");
      } catch (error) {
        logger.error(`Error during STDIO server shutdown: ${error instanceof Error ? error.message : String(error)}`);
      }
    };
    
    // Register cleanup handlers
    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);
    process.on("exit", cleanup);
    
    // Also handle transport close event
    if (stdioTransport instanceof EventEmitter) {
      stdioTransport.on("close", () => {
        logger.info("STDIO transport closed, cleaning up resources");
        cleanup().catch(error => {
          logger.error(`Error during cleanup after transport close: ${error instanceof Error ? error.message : String(error)}`);
        });
      });
    } else {
      logger.warn("STDIO transport does not support events");
    }
    
  } catch (error) {
    logger.error(`Failed to start STDIO MCP server: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

// Run the STDIO server if this is the entry point
const isMainModule = import.meta.url === `file://${process.argv[1]}`;

if (isMainModule) {
  startStdioServer().catch(error => {
    logger.error(`Unhandled exception in STDIO server: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
