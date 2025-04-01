// src/utils/session-manager.ts
import crypto from 'crypto';
import { logger } from './secure-logger.js';

/** Session data interface */
export interface SessionData {
  /** Unique session identifier */
  id: string;
  /** Session creation timestamp */
  createdAt: Date;
  /** Last activity timestamp */
  lastActivity: Date;
  /** Session context data */
  context: Record<string, unknown>;
}

/** Session manager configuration */
export interface SessionManagerConfig {
  /** Session timeout in milliseconds (default: 30 minutes) */
  sessionTimeout?: number;
  /** Cleanup interval for expired sessions (default: 5 minutes) */
  cleanupInterval?: number;
}

/**
 * Session manager for MCP conversation contexts
 * Handles session creation, retrieval, update, and automatic expiration
 */
export class SessionManager {
  private sessions: Map<string, SessionData>;
  private sessionTimeout: number;
  private cleanupInterval: number;
  private cleanupTimer: NodeJS.Timeout | null;

  constructor(config: SessionManagerConfig = {}) {
    this.sessions = new Map<string, SessionData>();
    this.sessionTimeout = config.sessionTimeout || 30 * 60 * 1000; // 30 minutes default
    this.cleanupInterval = config.cleanupInterval || 5 * 60 * 1000; // 5 minutes default
    this.cleanupTimer = null;
    
    // Start the cleanup job
    this.startCleanupJob();
  }

  /**
   * Generate a unique session ID
   */
  private generateSessionId(): string {
    return crypto.randomUUID();
  }

  /**
   * Create a new session with initial context
   */
  createSession(initialContext: Record<string, unknown> = {}): SessionData {
    const sessionId = this.generateSessionId();
    const now = new Date();
    
    const sessionData: SessionData = {
      id: sessionId,
      createdAt: now,
      lastActivity: now,
      context: { ...initialContext }
    };
    
    this.sessions.set(sessionId, sessionData);
    logger.info(`Session created: ${sessionId}`);
    
    return sessionData;
  }

  /**
   * Get session by ID, updating last activity timestamp
   */
  getSession(sessionId: string): SessionData | null {
    const session = this.sessions.get(sessionId);
    
    if (session) {
      // Update last activity time
      session.lastActivity = new Date();
      return session;
    }
    
    return null;
  }

  /**
   * Update session context
   */
  updateSession(sessionId: string, contextUpdates: Record<string, unknown>): boolean {
    const session = this.getSession(sessionId);
    
    if (!session) {
      logger.warn(`Attempted to update non-existent session: ${sessionId}`);
      return false;
    }
    
    // Update the context with new values
    session.context = {
      ...session.context,
      ...contextUpdates
    };
    
    // Update the map with the refreshed session
    this.sessions.set(sessionId, session);
    return true;
  }

  /**
   * Delete a session by ID
   */
  deleteSession(sessionId: string): boolean {
    if (this.sessions.has(sessionId)) {
      this.sessions.delete(sessionId);
      logger.info(`Session deleted: ${sessionId}`);
      return true;
    }
    
    return false;
  }

  /**
   * Get all active sessions
   */
  getAllSessions(): SessionData[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Check if a session has expired
   */
  private isSessionExpired(session: SessionData): boolean {
    const now = new Date().getTime();
    const lastActivity = session.lastActivity.getTime();
    
    return (now - lastActivity) > this.sessionTimeout;
  }

  /**
   * Clean up expired sessions
   */
  private cleanupExpiredSessions(): void {
    logger.debug('Running expired session cleanup');
    
    const expiredSessionIds: string[] = [];
    
    // Find expired sessions
    this.sessions.forEach((session, sessionId) => {
      if (this.isSessionExpired(session)) {
        expiredSessionIds.push(sessionId);
      }
    });
    
    // Delete expired sessions
    if (expiredSessionIds.length > 0) {
      expiredSessionIds.forEach(sessionId => {
        this.sessions.delete(sessionId);
      });
      
      logger.info(`Cleaned up ${expiredSessionIds.length} expired sessions`);
    }
  }

  /**
   * Start the automated cleanup job
   */
  private startCleanupJob(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredSessions();
    }, this.cleanupInterval);
    
    logger.info(`Session cleanup job scheduled every ${this.cleanupInterval / 1000} seconds`);
  }

  /**
   * Stop the automated cleanup job
   */
  stopCleanupJob(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
      logger.info('Session cleanup job stopped');
    }
  }
}

// Export default instance
export const sessionManager = new SessionManager();
