// src/utils/conversation-history.ts
import { logger } from './secure-logger.js';

/**
 * Message interface for conversation history
 */
export interface ConversationMessage {
  /** Message ID */
  id: string;
  /** Session ID */
  sessionId: string;
  /** Message role (user, assistant, system) */
  role: 'user' | 'assistant' | 'system';
  /** Message content */
  content: string;
  /** Message timestamp */
  timestamp: Date;
  /** Tool calls in the message (if any) */
  toolCalls?: any[];
  /** Tool results (if any) */
  toolResults?: any[];
  /** Message metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Conversation history storage configuration
 */
export interface ConversationHistoryConfig {
  /** Maximum number of messages per session (default: 100) */
  maxMessagesPerSession?: number;
  /** Whether to persist history to disk (default: false) */
  persistToDisk?: boolean;
  /** Storage directory for persistence (default: './data/conversations') */
  storageDir?: string;
}

/**
 * Conversation history storage
 * Manages conversation history for MCP sessions
 */
export class ConversationHistory {
  private history: Map<string, ConversationMessage[]>;
  private maxMessagesPerSession: number;
  private persistToDisk: boolean;
  private storageDir: string;

  constructor(config: ConversationHistoryConfig = {}) {
    this.history = new Map<string, ConversationMessage[]>();
    this.maxMessagesPerSession = config.maxMessagesPerSession || 100;
    this.persistToDisk = config.persistToDisk || false;
    this.storageDir = config.storageDir || './data/conversations';
    
    logger.info(`Conversation history initialized (max ${this.maxMessagesPerSession} messages per session)`);
    
    if (this.persistToDisk) {
      logger.info(`Conversation history persistence enabled (storage: ${this.storageDir})`);
      // TODO: Create storage directory if it doesn't exist
      // TODO: Load existing conversations from disk
    }
  }

  /**
   * Add a message to the conversation history
   * @param message Message to add
   * @returns The added message
   */
  addMessage(message: ConversationMessage): ConversationMessage {
    const { sessionId } = message;
    
    // Get or create session history
    if (!this.history.has(sessionId)) {
      this.history.set(sessionId, []);
    }
    
    // Get session history
    const sessionHistory = this.history.get(sessionId)!;
    
    // Add message to history
    sessionHistory.push(message);
    
    // Trim history if needed
    if (sessionHistory.length > this.maxMessagesPerSession) {
      // Remove oldest messages
      const removed = sessionHistory.splice(0, sessionHistory.length - this.maxMessagesPerSession);
      logger.debug(`Trimmed ${removed.length} old messages from session ${sessionId}`);
    }
    
    // Update history
    this.history.set(sessionId, sessionHistory);
    
    logger.debug(`Added message to history for session ${sessionId} (total: ${sessionHistory.length})`);
    
    // Persist to disk if enabled
    if (this.persistToDisk) {
      this.persistSession(sessionId).catch(error => {
        logger.error(`Failed to persist conversation history for session ${sessionId}: ${error}`);
      });
    }
    
    return message;
  }

  /**
   * Get conversation history for a session
   * @param sessionId Session ID
   * @returns Array of messages for the session
   */
  getSessionHistory(sessionId: string): ConversationMessage[] {
    return this.history.get(sessionId) || [];
  }

  /**
   * Clear conversation history for a session
   * @param sessionId Session ID
   * @returns True if history was cleared, false if session not found
   */
  clearSessionHistory(sessionId: string): boolean {
    if (!this.history.has(sessionId)) {
      return false;
    }
    
    this.history.set(sessionId, []);
    logger.info(`Cleared conversation history for session ${sessionId}`);
    
    // Remove persisted history if enabled
    if (this.persistToDisk) {
      this.deletePersistedSession(sessionId).catch(error => {
        logger.error(`Failed to delete persisted conversation history for session ${sessionId}: ${error}`);
      });
    }
    
    return true;
  }

  /**
   * Delete conversation history for a session
   * @param sessionId Session ID
   * @returns True if history was deleted, false if session not found
   */
  deleteSessionHistory(sessionId: string): boolean {
    if (!this.history.has(sessionId)) {
      return false;
    }
    
    this.history.delete(sessionId);
    logger.info(`Deleted conversation history for session ${sessionId}`);
    
    // Remove persisted history if enabled
    if (this.persistToDisk) {
      this.deletePersistedSession(sessionId).catch(error => {
        logger.error(`Failed to delete persisted conversation history for session ${sessionId}: ${error}`);
      });
    }
    
    return true;
  }

  /**
   * Get all session IDs with conversation history
   * @returns Array of session IDs
   */
  getAllSessionIds(): string[] {
    return Array.from(this.history.keys());
  }

  /**
   * Get the number of messages in a session
   * @param sessionId Session ID
   * @returns Number of messages
   */
  getSessionMessageCount(sessionId: string): number {
    return this.history.get(sessionId)?.length || 0;
  }

  /**
   * Persist session history to disk
   * @param sessionId Session ID to persist
   */
  private async persistSession(sessionId: string): Promise<void> {
    // This is a placeholder for actual persistence implementation
    // In a real implementation, this would write to disk or database
    logger.debug(`[Placeholder] Persisting conversation history for session ${sessionId}`);
    return Promise.resolve();
  }

  /**
   * Delete persisted session history
   * @param sessionId Session ID to delete
   */
  private async deletePersistedSession(sessionId: string): Promise<void> {
    // This is a placeholder for actual persistence implementation
    // In a real implementation, this would delete from disk or database
    logger.debug(`[Placeholder] Deleting persisted conversation history for session ${sessionId}`);
    return Promise.resolve();
  }
}

// Export default instance
export const conversationHistory = new ConversationHistory();
