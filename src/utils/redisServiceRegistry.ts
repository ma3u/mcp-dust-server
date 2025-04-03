// Using type-only import for Redis to avoid requiring the package in development
import type { Redis } from 'ioredis';
import { ServiceRegistry } from './portManager.js';
import { logger } from './secure-logger.js';

// Use the secure logger with a prefix for Redis service registry logs
const logPrefix = '[RedisRegistry]';

/**
 * Redis-based implementation of the service registry
 * Provides distributed instance tracking for production environments
 */
export class RedisServiceRegistry implements ServiceRegistry {
  private readonly redis: Redis;
  private readonly keyPrefix: string;
  private readonly instanceTTL: number;
  
  /**
   * Creates a new Redis-based service registry
   * 
   * @param redisClient - Redis client instance
   * @param options - Configuration options
   */
  constructor(
    redisClient: Redis,
    options: {
      keyPrefix?: string;
      instanceTTL?: number;
    } = {}
  ) {
    this.redis = redisClient;
    this.keyPrefix = options.keyPrefix || 'mcp:instances:';
    this.instanceTTL = options.instanceTTL || 60; // 60 seconds TTL by default
  }
  
  /**
   * Register an instance with automatic TTL for self-healing
   */
  async registerInstance(instanceId: string, port: number): Promise<void> {
    const key = `${this.keyPrefix}${instanceId}`;
    await this.redis.set(key, port.toString(), 'EX', this.instanceTTL);
    logger.info(`${logPrefix} Registered instance ${instanceId} on port ${port} with TTL ${this.instanceTTL}s`);
    
    // Schedule periodic renewal of the registration
    this.startHeartbeat(instanceId, port);
  }
  
  /**
   * Deregister an instance when it's shutting down
   */
  async deregisterInstance(instanceId: string): Promise<void> {
    const key = `${this.keyPrefix}${instanceId}`;
    await this.redis.del(key);
    logger.info(`${logPrefix} Deregistered instance ${instanceId}`);
  }
  
  /**
   * Get all active instances
   */
  async getActiveInstances(): Promise<Map<string, number>> {
    const instances = new Map<string, number>();
    const keys = await this.redis.keys(`${this.keyPrefix}*`);
    
    if (keys.length === 0) {
      return instances;
    }
    
    // Get all values for the keys
    const values = await this.redis.mget(keys);
    
    // Build the map of instance IDs to ports
    keys.forEach((key: string, index: number) => {
      const instanceId = key.substring(this.keyPrefix.length);
      const port = parseInt(values[index] || '0', 10);
      
      if (port > 0) {
        instances.set(instanceId, port);
      }
    });
    
    return instances;
  }
  
  /**
   * Start a heartbeat to periodically renew the instance registration
   * This prevents instances from disappearing if they're still alive
   */
  private startHeartbeat(instanceId: string, port: number): void {
    // Set heartbeat interval to 1/2 of the TTL to ensure we don't expire
    const heartbeatInterval = Math.floor(this.instanceTTL * 1000 / 2);
    
    const interval = setInterval(async () => {
      try {
        const key = `${this.keyPrefix}${instanceId}`;
        await this.redis.set(key, port.toString(), 'EX', this.instanceTTL);
        logger.debug(`${logPrefix} Heartbeat for instance ${instanceId} on port ${port}`);
      } catch (error) {
        logger.error(`${logPrefix} Failed to send heartbeat for instance ${instanceId}: ${error}`);
      }
    }, heartbeatInterval);
    
    // Clean up the interval on process exit
    process.on('beforeExit', () => {
      clearInterval(interval);
    });
  }
}
