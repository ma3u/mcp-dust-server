// src/api/dust-client.ts
import { DustAPI } from "@dust-tt/client";
import { logger } from "../utils/secure-logger.js";
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Define user context type
export interface UserContext {
  timezone: string;
  username: string;
  email: string;
  fullName: string;
  origin: string;
}

/**
 * Dust API client configuration
 * Creates and configures a Dust API client with proper logging and error handling
 */
export class DustClient {
  private static instance: DustClient;
  private client: DustAPI;
  private userContext: UserContext;
  private workspaceId: string;
  private agentId: string;

  private constructor() {
    // Get configuration from environment variables
    const domain = process.env.DUST_DOMAIN || "https://dust.tt";
    this.workspaceId = process.env.DUST_WORKSPACE_ID || "";
    const apiKey = process.env.DUST_API_KEY || "";
    this.agentId = process.env.DUST_AGENT_ID || "";

    // Validate required environment variables
    if (!this.workspaceId || !apiKey) {
      const errorMsg = "Missing required Dust API configuration - check DUST_WORKSPACE_ID and DUST_API_KEY in .env";
      logger.error(errorMsg);
      throw new Error(errorMsg);
    }

    // Default user context for conversations
    this.userContext = {
      timezone: process.env.DUST_TIMEZONE || "UTC",
      username: process.env.DUST_USERNAME || "mcp-user",
      email: process.env.DUST_EMAIL || "mcp-user@example.com",
      fullName: process.env.DUST_FULLNAME || "MCP User",
      origin: "mcp-server"
    };

    // Create Dust API client with secure logging
    // Create a console-compatible logger
    const logHandler = {
      ...console,
      debug: (...args: any[]) => logger.debug('Dust API:', ...args),
      info: (...args: any[]) => logger.info('Dust API:', ...args),
      warn: (...args: any[]) => logger.warn('Dust API:', ...args),
      error: (...args: any[]) => logger.error('Dust API:', ...args)
    };
    
    this.client = new DustAPI(
      { url: domain },
      { 
        workspaceId: this.workspaceId,
        apiKey
      },
      logHandler
    );

    logger.info(`Dust API client initialized for workspace: ${this.workspaceId}`);
  }

  /**
   * Get the Dust API client singleton instance
   */
  public static getInstance(): DustClient {
    if (!DustClient.instance) {
      DustClient.instance = new DustClient();
    }
    return DustClient.instance;
  }

  /**
   * Get the configured Dust API client
   */
  getClient(): DustAPI {
    return this.client;
  }

  /**
   * Get the default user context for conversations
   */
  getUserContext(): UserContext {
    return { ...this.userContext };
  }

  /**
   * Set custom user context for conversations
   */
  setUserContext(context: Partial<UserContext>): void {
    this.userContext = {
      ...this.userContext,
      ...context
    };
    logger.info('Updated user context:', this.userContext);
  }

  /**
   * Get the configured workspace ID
   */
  getWorkspaceId(): string {
    return this.workspaceId;
  }

  /**
   * Get the configured agent ID
   */
  getAgentId(): string {
    return this.agentId;
  }
}

// Export default client instance
export const dustClient = DustClient.getInstance();
