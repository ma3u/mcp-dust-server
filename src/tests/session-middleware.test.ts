// src/tests/session-middleware.test.ts
import { describe, it, beforeEach, afterEach, expect } from '@jest/globals';
import { createSessionMiddleware, sessionActivityMiddleware, requireSessionMiddleware } from '../middleware/session-middleware.js';
import { sessionManager } from '../utils/session-manager.js';
import { Request, Response, NextFunction } from 'express';

describe('Session Middleware', () => {
  // Mock Express request and response
  let req: Partial<Request>;
  let res: any; // Using any type for test mocks to avoid complex type issues
  let nextCalled: boolean;
  let nextError: Error | null;
  
  // Reset mocks before each test
  beforeEach(() => {
    req = {
      headers: {},
      // Using any to bypass strict typing for test mocks
      header: function(name: string): any {
        if (name === 'set-cookie') {
          return undefined;
        }
        return this.headers?.[name.toLowerCase()];
      },
      ip: '127.0.0.1'
    };
    
    res = {
      headers: {},
      setHeader: function(name: string, value: string) {
        this.headers = this.headers || {};
        this.headers[name.toLowerCase()] = value;
        return this;
      },
      status: function(code: number) {
        this.statusCode = code;
        return this;
      },
      json: function(data: any) {
        this.data = data;
        return this;
      },
      statusCode: 200,
      data: null
    };
    
    nextCalled = false;
    nextError = null;
  });
  
  // Clean up after each test
  afterEach(() => {
    // Clean up any sessions created during tests
    const sessions = sessionManager.getAllSessions();
    for (const session of sessions) {
      sessionManager.deleteSession(session.id);
    }
  });
  
  // Helper function for next middleware
  const next: NextFunction = (error?: any) => {
    nextCalled = true;
    nextError = error || null;
    return undefined;
  };
  
  it('should create a new session when none exists', () => {
    const middleware = createSessionMiddleware();
    middleware(req as Request, res as Response, next);
    
    expect(nextCalled).toBe(true);
    expect(nextError).toBeNull();
    expect(req.mcpSessionId).toBeDefined();
    expect(req.mcpSession).toBeDefined();
    expect(res.headers?.['mcp-session-id']).toBeDefined();
    expect(req.mcpSessionId).toBe(res.headers?.['mcp-session-id']);
  });
  
  it('should use existing session when valid session ID is provided', () => {
    // Create a session first
    const session = sessionManager.createSession({ test: true });
    
    // Set up request with session ID
    req.headers = { 'mcp-session-id': session.id };
    
    const middleware = createSessionMiddleware();
    middleware(req as Request, res as Response, next);
    
    expect(nextCalled).toBe(true);
    expect(nextError).toBeNull();
    expect(req.mcpSessionId).toBe(session.id);
    expect(req.mcpSession?.context).toEqual({ test: true });
    expect(res.headers?.['mcp-session-id']).toBe(session.id);
  });
  
  it('should return 401 when session is required but not found', () => {
    // Set up request with invalid session ID
    req.headers = { 'mcp-session-id': 'invalid-session-id' };
    
    const middleware = createSessionMiddleware({ requireSession: true });
    middleware(req as Request, res as Response, next);
    
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
    expect(res.data?.error).toBeDefined();
  });
  
  it('should update session activity', () => {
    // Create a session first
    const session = sessionManager.createSession();
    const originalTime = session.lastActivity.getTime();
    
    // Wait a small amount of time
    const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    
    // Set up request with session ID
    req.mcpSessionId = session.id;
    req.mcpSession = session;
    
    return wait(10).then(() => {
      const middleware = sessionActivityMiddleware();
      middleware(req as Request, res as Response, next);
      
      expect(nextCalled).toBe(true);
      expect(nextError).toBeNull();
      expect(req.mcpSession?.lastActivity).toBeDefined();
      // Convert Date to timestamp for comparison
      const currentActivityTime = req.mcpSession?.lastActivity instanceof Date ? req.mcpSession.lastActivity.getTime() : 0;
      expect(currentActivityTime).toBeGreaterThan(originalTime);
    });
  });
  
  it('should require valid session', () => {
    // Test without session
    const middleware = requireSessionMiddleware();
    middleware(req as Request, res as Response, next);
    
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
    expect(res.data?.error).toBeDefined();
    
    // Reset for next test
    nextCalled = false;
    res.statusCode = 200;
    res.data = null;
    
    // Create a session and test again
    const session = sessionManager.createSession();
    req.mcpSessionId = session.id;
    req.mcpSession = session;
    
    middleware(req as Request, res as Response, next);
    
    expect(nextCalled).toBe(true);
    expect(nextError).toBeNull();
  });
});
