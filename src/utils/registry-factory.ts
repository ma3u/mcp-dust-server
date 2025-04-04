/**
 * Service Registry Factory
 * 
 * This module provides a factory function to create the service registry
 * implementation.
 */

import { InMemoryServiceRegistry, ServiceRegistry } from './portManager.js';
import { logger } from './secure-logger.js';

/**
 * Create the service registry
 * 
 * @returns A service registry implementation
 */
export async function createServiceRegistry(): Promise<ServiceRegistry> {
  // Use in-memory registry for all environments
  logger.info('[Registry] Using in-memory service registry');
  return new InMemoryServiceRegistry();
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
