// src/tests/conversation-history.test.ts
import { describe, it, beforeEach, expect } from '@jest/globals';
import { ConversationHistory, ConversationMessage } from '../utils/conversation-history.js';

describe('Conversation History', () => {
  let history: ConversationHistory;
  
  // Create a new instance before each test
  beforeEach(() => {
    history = new ConversationHistory({
      maxMessagesPerSession: 5,
      persistToDisk: false
    });
  });
  
  // Helper to create a test message
  const createTestMessage = (sessionId: string, role: 'user' | 'assistant' | 'system', content: string): ConversationMessage => {
    return {
      id: `msg-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      sessionId,
      role,
      content,
      timestamp: new Date()
    };
  };
  
  it('should add messages to history', () => {
    const sessionId = 'test-session-1';
    const message = createTestMessage(sessionId, 'user', 'Hello, world!');
    
    history.addMessage(message);
    
    const sessionHistory = history.getSessionHistory(sessionId);
    expect(sessionHistory.length).toBe(1);
    expect(sessionHistory[0].content).toBe('Hello, world!');
  });
  
  it('should respect max messages per session', () => {
    const sessionId = 'test-session-2';
    
    // Add 6 messages (max is 5)
    for (let i = 0; i < 6; i++) {
      history.addMessage(createTestMessage(sessionId, 'user', `Message ${i}`));
    }
    
    const sessionHistory = history.getSessionHistory(sessionId);
    expect(sessionHistory.length).toBe(5);
    expect(sessionHistory[0].content).toBe('Message 1');
    expect(sessionHistory[4].content).toBe('Message 5');
  });
  
  it('should clear session history', () => {
    const sessionId = 'test-session-3';
    
    // Add 3 messages
    for (let i = 0; i < 3; i++) {
      history.addMessage(createTestMessage(sessionId, 'user', `Message ${i}`));
    }
    
    // Verify messages were added
    expect(history.getSessionHistory(sessionId).length).toBe(3);
    
    // Clear history
    const result = history.clearSessionHistory(sessionId);
    expect(result).toBe(true);   // Verify history is empty
    expect(history.getSessionHistory(sessionId).length).toBe(0);
  });
  
  it('should delete session history', () => {
    const sessionId = 'test-session-4';
    
    // Add a message
    history.addMessage(createTestMessage(sessionId, 'user', 'Test message'));
    
    // Verify message was added
    expect(history.getSessionHistory(sessionId).length).toBe(1);
    
    // Delete history
    const result = history.deleteSessionHistory(sessionId);
    expect(result).toBe(true);   // Verify history is empty
    expect(history.getSessionHistory(sessionId).length).toBe(0);
  });
  
  it('should return all session IDs', () => {
    // Add messages for multiple sessions
    history.addMessage(createTestMessage('session-a', 'user', 'Message A'));
    history.addMessage(createTestMessage('session-b', 'user', 'Message B'));
    history.addMessage(createTestMessage('session-c', 'user', 'Message C'));
    
    const sessionIds = history.getAllSessionIds();
    expect(sessionIds.length).toBe(3);
    expect(sessionIds.includes('session-a')).toBe(true);
    expect(sessionIds.includes('session-b')).toBe(true);
    expect(sessionIds.includes('session-c')).toBe(true);
  });
  
  it('should return message count for a session', () => {
    const sessionId = 'test-session-5';
    
    // Add 3 messages
    for (let i = 0; i < 3; i++) {
      history.addMessage(createTestMessage(sessionId, 'user', `Message ${i}`));
    }
    
    expect(history.getSessionMessageCount(sessionId)).toBe(3);
    expect(history.getSessionMessageCount('nonexistent-session')).toBe(0);
  });
});
