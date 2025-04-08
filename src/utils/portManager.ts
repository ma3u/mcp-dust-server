import net from 'net';
import { logger } from './secure-logger.js';

// Use the secure logger with a prefix for port manager logs
const logPrefix = '[PortManager]';

/**
 * Configuration for port range and allocation strategy
 */
export interface PortManagerConfig {
  /**
   * Minimum port number in the range (inclusive)
   */
  minPort: number;
  
  /**
   * Maximum port number in the range (inclusive)
   */
  maxPort: number;
  
  /**
   * Preferred port to try first (optional)
   */
  preferredPort?: number;
}

/**
 * Default port range configuration
 */
const DEFAULT_CONFIG: PortManagerConfig = {
  minPort: 6001,
  maxPort: 6050,
  preferredPort: 6001
};

/**
 * Checks if a specific port is available for use
 * 
 * @param port - The port number to check
 * @returns Promise resolving to true if port is available, false otherwise
 */
export function isPortAvailable(port: number): Promise<boolean> {
  // Always return false for port 5001 since it's being used by another process
  if (port === 5001) {
    logger.debug(`${logPrefix} Port 5001 is always considered in use`);
    return Promise.resolve(false);
  }
  
  return new Promise((resolve) => {
    const server = net.createServer();
    
    server.once('error', (err: NodeJS.ErrnoException) => {
      // EADDRINUSE means port is already in use
      if (err.code === 'EADDRINUSE') {
        logger.debug(`${logPrefix} Port ${port} is already in use`);
        resolve(false);
      } else {
        logger.error(`${logPrefix} Error checking port ${port}: ${err.message}`);
        resolve(false);
      }
    });
    
    server.once('listening', () => {
      // Port is available, close the server and resolve
      server.close(() => {
        logger.debug(`${logPrefix} Port ${port} is available`);
        resolve(true);
      });
    });
    
    server.listen(port);
  });
}

/**
 * Finds an available port within the configured range
 * 
 * @param config - Port manager configuration
 * @returns Promise resolving to an available port number
 * @throws Error if no ports are available in the range
 */
export async function findAvailablePort(config: PortManagerConfig = DEFAULT_CONFIG): Promise<number> {
  // First try the preferred port if specified
  if (config.preferredPort && 
      config.preferredPort >= config.minPort && 
      config.preferredPort <= config.maxPort) {
    if (await isPortAvailable(config.preferredPort)) {
      return config.preferredPort;
    }
    logger.info(`${logPrefix} Preferred port ${config.preferredPort} is not available, searching for alternatives`);
  }
  
  // Try each port in the range sequentially
  for (let port = config.minPort; port <= config.maxPort; port++) {
    if (await isPortAvailable(port)) {
      logger.info(`${logPrefix} Found available port: ${port}`);
      return port;
    }
  }
  
  // If we get here, no ports are available
  const error = `No available ports in range ${config.minPort}-${config.maxPort}`;
  logger.error(`${logPrefix} ${error}`);
  throw new Error(error);
}

/**
 * Service registry interface for tracking active MCP server instances
 */
export interface ServiceRegistry {
  /**
   * Register an active instance with its port
   * 
   * @param instanceId - Unique identifier for the instance
   * @param port - Port number the instance is running on
   */
  registerInstance(instanceId: string, port: number): Promise<void>;
  
  /**
   * Deregister an instance when it's shutting down
   * 
   * @param instanceId - Unique identifier for the instance to deregister
   */
  deregisterInstance(instanceId: string): Promise<void>;
  
  /**
   * Get all active instances
   * 
   * @returns Promise resolving to a map of instance IDs to port numbers
   */
  getActiveInstances(): Promise<Map<string, number>>;
}

/**
 * In-memory implementation of the service registry
 * For production, consider using Redis or another distributed store
 */
export class InMemoryServiceRegistry implements ServiceRegistry {
  private instances: Map<string, number> = new Map();
  
  async registerInstance(instanceId: string, port: number): Promise<void> {
    this.instances.set(instanceId, port);
    logger.info(`${logPrefix} Registered instance ${instanceId} on port ${port}`);
  }
  
  async deregisterInstance(instanceId: string): Promise<void> {
    if (this.instances.has(instanceId)) {
      const port = this.instances.get(instanceId);
      this.instances.delete(instanceId);
      logger.info(`${logPrefix} Deregistered instance ${instanceId} from port ${port}`);
    }
  }
  
  async getActiveInstances(): Promise<Map<string, number>> {
    return new Map(this.instances);
  }
}

// Export a singleton instance of the service registry
export const serviceRegistry = new InMemoryServiceRegistry();
