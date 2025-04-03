/**
 * Service Registry Factory
 * 
 * This module provides a factory function to create the appropriate service registry
 * implementation based on configuration.
 */

import { InMemoryServiceRegistry, ServiceRegistry } from './portManager.js';
import { logger } from './secure-logger.js';
import { defaultConfig } from '../config/instance-config.js';

// Lazy-load Redis implementation to avoid requiring the package in development
let RedisServiceRegistry: any = null;

/**
 * Create the appropriate service registry based on configuration
 * 
 * @returns A service registry implementation
 */
export async function createServiceRegistry(): Promise<ServiceRegistry> {
  // Use in-memory registry for development or if Redis is not configured
  if (!defaultConfig.useRedisRegistry) {
    logger.info('[Registry] Using in-memory service registry');
    return new InMemoryServiceRegistry();
  }
  
  try {
    // Dynamically import Redis implementation to avoid requiring the package in development
    const { RedisServiceRegistry: RedisImpl } = await import('./redisServiceRegistry.js');
    RedisServiceRegistry = RedisImpl;
    
    // Dynamically import ioredis
    const { default: Redis } = await import('ioredis');
    
    // Create Redis client
    const redisClient = new Redis(defaultConfig.redisUrl);
    
    // Create Redis service registry
    logger.info(`[Registry] Using Redis service registry with TTL ${defaultConfig.instanceTtl}s`);
    
    return new RedisServiceRegistry(redisClient, {
      keyPrefix: 'mcp:instances:',
      instanceTTL: defaultConfig.instanceTtl
    });
  } catch (error) {
    logger.error('[Registry] Failed to create Redis service registry:', error);
    logger.warn('[Registry] Falling back to in-memory service registry');
    return new InMemoryServiceRegistry();
  }
}

/**
 * Get the singleton service registry instance
 * This is a convenience function that creates the registry on first call
 * and returns the same instance on subsequent calls
 */
let registryInstance: ServiceRegistry | null = null;

export async function getServiceRegistry(): Promise<ServiceRegistry> {
  if (!registryInstance) {
    registryInstance = await createServiceRegistry();
  }
  return registryInstance;
}
