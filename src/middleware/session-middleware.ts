// src/middleware/session-middleware.ts
import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/secure-logger.js';
import { sessionManager, SessionData } from '../utils/session-manager.js';

/**
 * Session middleware configuration options
 */
export interface SessionMiddlewareOptions {
  /** Session ID header name (default: 'Mcp-Session-Id') */
  sessionIdHeader?: string;
  /** Whether to create a new session if none exists (default: true) */
  createIfMissing?: boolean;
  /** Whether to require a valid session (default: false) */
  requireSession?: boolean;
  /** Whether to extend the session on each request (default: true) */
  extendSession?: boolean;
}

/**
 * Extend Express Request interface to include session
 */
declare global {
  namespace Express {
    interface Request {
      mcpSession?: SessionData;
      mcpSessionId?: string;
    }
  }
}

/**
 * Create session middleware for Express
 * Attaches session data to the request object
 */
export function createSessionMiddleware(options: SessionMiddlewareOptions = {}) {
  // Default options
  const sessionIdHeader = options.sessionIdHeader || 'Mcp-Session-Id';
  const createIfMissing = options.createIfMissing !== false;
  const requireSession = options.requireSession || false;
  const extendSession = options.extendSession !== false;
  
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Extract session ID from header
      const sessionId = req.header(sessionIdHeader);
      
      if (sessionId) {
        // Try to get existing session
        const session = sessionManager.getSession(sessionId);
        
        if (session) {
          // Session found - attach to request
          req.mcpSession = session;
          req.mcpSessionId = sessionId;
          
          // Add session ID to response header
          res.setHeader(sessionIdHeader, sessionId);
          
          logger.debug(`Session attached to request: ${sessionId}`);
          
          // Continue to next middleware
          return next();
        } else if (requireSession) {
          // Session required but not found
          logger.warn(`Required session not found: ${sessionId}`);
          return res.status(401).json({ error: 'Invalid session ID' });
        }
        // Session not found but not required
        logger.warn(`Session not found: ${sessionId}`);
      }
      
      // No valid session found - create new one if allowed
      if (createIfMissing) {
        // Create a new session
        const initialContext = {
          userAgent: req.header('User-Agent') || 'unknown',
          remoteAddress: req.ip || 'unknown',
          createdAt: new Date().toISOString()
        };
        
        const newSession = sessionManager.createSession(initialContext);
        
        // Attach to request
        req.mcpSession = newSession;
        req.mcpSessionId = newSession.id;
        
        // Add session ID to response header
        res.setHeader(sessionIdHeader, newSession.id);
        
        logger.info(`New session created: ${newSession.id}`);
      } else if (requireSession) {
        // Session required but not created
        logger.warn('Session required but not created');
        return res.status(401).json({ error: 'Session required' });
      }
      
      // Continue to next middleware
      next();
    } catch (error) {
      logger.error(`Session middleware error: ${error instanceof Error ? error.message : String(error)}`);
      next(error);
    }
  };
}

/**
 * Middleware to track session activity
 * Updates the last activity timestamp for the session
 */
export function sessionActivityMiddleware() {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (req.mcpSessionId && req.mcpSession) {
        // Update session last activity
        req.mcpSession.lastActivity = new Date();
        logger.debug(`Session activity updated: ${req.mcpSessionId}`);
      }
      next();
    } catch (error) {
      logger.error(`Session activity middleware error: ${error instanceof Error ? error.message : String(error)}`);
      next(error);
    }
  };
}

/**
 * Middleware to require a valid session
 * Returns 401 if no valid session is found
 */
export function requireSessionMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.mcpSessionId || !req.mcpSession) {
      logger.warn('Session required but not found');
      return res.status(401).json({ error: 'Valid session required' });
    }
    next();
  };
}
