import { createServiceRegistry, getServiceRegistry } from '../registry-factory.js';
import { InMemoryServiceRegistry } from '../portManager.js';
import { jest } from '@jest/globals';

// Mock the config
jest.mock('../../config/instance-config.js', () => ({
  defaultConfig: {
    useRedisRegistry: false,
    redisUrl: 'redis://localhost:6379',
    instanceTtl: 60
  }
}));

// Mock the logger
jest.mock('../secure-logger.js', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  }
}));

describe('Registry Factory', () => {
  // Add afterEach hook to clean up after tests
  afterEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
    delete process.env.USE_REDIS_REGISTRY;
  });
  
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset the singleton instance by directly accessing the module
    jest.isolateModules(async () => {
      // Use dynamic import for ES modules
      const registryFactory = await import('../registry-factory.js');
      // @ts-ignore - Access private property for testing
      if (registryFactory.registryInstance) {
        // @ts-ignore - Access private property for testing
        registryFactory.registryInstance = null;
      }
    });
  });

  describe('createServiceRegistry', () => {
    it('should create an InMemoryServiceRegistry when useRedisRegistry is false', async () => {
      const registry = await createServiceRegistry();
      expect(registry).toBeInstanceOf(InMemoryServiceRegistry);
    });

    it('should handle errors gracefully and fall back to InMemoryServiceRegistry', async () => {
      // Save original env
      const originalEnv = process.env.USE_REDIS_REGISTRY;
      
      try {
        // Set environment variable to use Redis
        process.env.USE_REDIS_REGISTRY = 'true';
        
        // Reset modules to ensure clean state
        jest.resetModules();
        
        // Mock the dynamic import to throw an error
        jest.mock('../redisServiceRegistry.js', () => {
          return {
            RedisServiceRegistry: function() {
              throw new Error('Redis not available');
            }
          };
        });
        
        // Re-import the module to get a fresh instance with our mocks applied
        const { createServiceRegistry } = await import('../registry-factory.js');
        
        // This should fall back to InMemoryServiceRegistry
        const registry = await createServiceRegistry();
        
        // Verify fallback behavior
        expect(registry).toBeInstanceOf(InMemoryServiceRegistry);
      } finally {
        // Restore original env
        if (originalEnv === undefined) {
          delete process.env.USE_REDIS_REGISTRY;
        } else {
          process.env.USE_REDIS_REGISTRY = originalEnv;
        }
        
        // Clear mocks
        jest.resetModules();
        jest.unmock('../redisServiceRegistry.js');
      }
    });
  });

  describe('getServiceRegistry', () => {
    it('should return the same instance on subsequent calls', async () => {
      const registry1 = await getServiceRegistry();
      const registry2 = await getServiceRegistry();
      
      expect(registry1).toBe(registry2);
    });
  });
});
