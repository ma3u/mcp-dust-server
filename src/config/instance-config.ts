/**
 * Configuration for multi-instance MCP server
 * 
 * This module provides configuration options for the multi-instance MCP server
 * with dynamic port negotiation.
 */

import dotenv from 'dotenv';
import { PortManagerConfig } from '../utils/portManager.js';

// Load environment variables
dotenv.config();

/**
 * Multi-instance server configuration
 */
export interface MultiInstanceConfig {
  /**
   * Port configuration for dynamic port negotiation
   */
  portConfig: PortManagerConfig;
  
  /**
   * TTL for instance registration in seconds
   */
  instanceTtl: number;
  
  /**
   * Server name prefix
   */
  serverNamePrefix: string;
}

/**
 * Default configuration loaded from environment variables
 */
export const defaultConfig: MultiInstanceConfig = {
  portConfig: {
    minPort: parseInt(process.env.MCP_MIN_PORT || '5001', 10),
    maxPort: parseInt(process.env.MCP_MAX_PORT || '5050', 10),
    preferredPort: parseInt(process.env.MCP_PORT || '5001', 10)
  },
  instanceTtl: parseInt(process.env.INSTANCE_TTL || '60', 10),
  serverNamePrefix: process.env.SERVER_NAME_PREFIX || 'Dust MCP Bridge'
};

/**
 * Get the instance ID for this server
 * 
 * @returns The instance ID from environment or a default value
 */
export function getInstanceId(): string {
  return process.env.INSTANCE_ID || 'default-instance';
}

/**
 * Get the full server name including instance ID
 * 
 * @returns The full server name
 */
export function getServerName(): string {
  const prefix = defaultConfig.serverNamePrefix;
  const instanceId = getInstanceId();
  return `${prefix} (${instanceId})`;
}
