/**
 * @fileoverview STDIO MCP Server Implementation
 * 
 * This module implements a STDIO-based MCP server for desktop applications
 * like Claude Desktop. It uses the StdioServerTransport to communicate
 * with clients via standard input/output streams.
 * 
 * Claude Desktop only supports MCP servers using the stdio transport.
 * This implementation ensures full compatibility with Claude Desktop.
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
import { getServiceRegistry } from "../utils/registry-factory.js";
import { sessionManager } from "../utils/session-manager.js";
import * as dotenv from 'dotenv';

/**
 * Prepares the session for STDIO transport
 * 
 * @param sessionId - Session ID to prepare
 */
async function prepareStdioSession(sessionId: string): Promise<void> {
  // Load environment variables if not already loaded
  dotenv.config();
  
  // Initialize session in session manager if it doesn't exist
  const sessionExists = await sessionManager.getSession(sessionId);
  if (!sessionExists) {
    // Create a new session with the provided sessionId and transport type
    const newSession = sessionManager.createSession({
      transportType: 'stdio',
      customSessionId: sessionId // Store the custom session ID in context
    });
    logger.info(`Created new session with ID: ${newSession.id}`);
  } else {
    // Update last activity time
    await sessionManager.updateSession(sessionId, {
      lastActivity: new Date()
    });
    logger.info(`Updated existing session with ID: ${sessionId}`);
  }
}

/**
 * Starts an MCP server with STDIO transport
 * This is designed for desktop applications like Claude Desktop
 * 
 * @param sessionId - Optional session ID (generated if not provided)
 * @returns Promise that resolves when the server is started
 */
export async function startStdioServer(sessionId?: string): Promise<void> {
  try {
    // CRITICAL: Redirect console.log to stderr to avoid interfering with STDIO transport
    // Claude Desktop expects only JSON-RPC messages on stdout
    console.log = console.error;
    
    // Generate a session ID if not provided
    const session = sessionId || process.env.MCP_SESSION_ID || uuidv4();
    
    logger.info(`Starting STDIO MCP server with session ID: ${session}`);
    
    // Prepare the session for STDIO transport
    await prepareStdioSession(session);
    
    // Create the MCP server with STDIO transport type
    const mcpServer = await createMcpServer('stdio');
    
    // Create the STDIO transport
    const stdioTransport = new StdioServerTransport(process.stdin, process.stdout, session);
    
    // Set up heartbeat for keeping the connection alive
    // This is important for long-running sessions with Claude Desktop
    const heartbeatInterval = setInterval(() => {
      // Send heartbeat to stderr (not stdout)
      if (process.stderr.writable) {
        process.stderr.write(JSON.stringify({ type: 'heartbeat', timestamp: new Date().toISOString() }) + '\n');
      }
    }, 30000); // 30 second heartbeat
    
    // Connect the transport to the server
    await mcpServer.connect(stdioTransport);
    
    logger.info("STDIO MCP server started successfully");
    
    // Log a message to stderr (not stdout) to indicate the server is ready
    console.error("STDIO MCP server is ready for connections");
    
    // Handle process termination
    const cleanup = async () => {
      logger.info("Shutting down STDIO MCP server");
      
      try {
        // Clear heartbeat interval
        clearInterval(heartbeatInterval);
        
        // Clean up resources
        fileUploadService.cleanupSessionFiles(session);
        
        // Clear conversation history
        logger.info(`Cleaning up conversation history for session: ${session}`);
        conversationHistory.clearSessionHistory(session);
        
        // Remove session from session manager
        await sessionManager.deleteSession(session);
        
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
  // Load environment variables - prioritize test environment if specified
  if (process.env.NODE_ENV === 'test' || process.env.DOTENV_CONFIG_PATH) {
    const configPath = process.env.DOTENV_CONFIG_PATH || '.env.test';
    dotenv.config({ path: configPath });
    logger.info(`Loaded environment from ${configPath}`);
  } else {
    dotenv.config();
    logger.info('Loaded environment from default .env');
  }
  
  // Log key environment variables for debugging
  logger.info(`Starting STDIO server with MCP_NAME: ${process.env.MCP_NAME}`);
  
  // Use a try-catch block to catch and log any uncaught errors
  try {
    // Start the STDIO server
    startStdioServer().catch((error) => {
      logger.error(`Unhandled exception in STDIO server: ${error instanceof Error ? error.message : String(error)}`);
      if (error instanceof Error && error.stack) {
        logger.error(`Stack trace: ${error.stack}`);
      }
      process.exit(1);
    });
  } catch (error) {
    logger.error(`Uncaught error in STDIO server: ${error instanceof Error ? error.message : String(error)}`);
    if (error instanceof Error && error.stack) {
      logger.error(`Stack trace: ${error.stack}`);
    }
    process.exit(1);
  }
}
