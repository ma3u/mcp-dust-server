// src/tests/http-stream-transport.test.ts
import { describe, it, beforeEach, expect } from '@jest/globals';
import { HTTPStreamTransport } from '../utils/http-stream-transport.js';
import { EventEmitter } from 'events';

describe('HTTP Stream Transport', () => {
  // Mock Express response
  let res: any; // Using any type for test mocks to avoid complex type issues
  let responseData: string[];
  let headersSent: boolean;
  let statusCode: number;
  let closeHandler: (() => void) | null;
  
  // Reset mocks before each test
  beforeEach(() => {
    responseData = [];
    headersSent = false;
    statusCode = 200;
    closeHandler = null;
    
    // Create a mock response with event emitter capabilities
    const emitter = new EventEmitter();
    
    res = {
      headers: {},
      setHeader: function(name: string, value: string) {
        this.headers = this.headers || {};
        this.headers[name.toLowerCase()] = value;
        return this;
      },
      status: function(code: number) {
        statusCode = code;
        return this;
      },
      write: function(data: string) {
        responseData.push(data);
        return true;
      },
      end: function() {
        headersSent = true;
        if (closeHandler) closeHandler();
        return this;
      },
      on: function(event: string, handler: () => void) {
        if (event === 'close') {
          closeHandler = handler;
        }
        emitter.on(event, handler);
        return this;
      },
      headersSent: false
    };
  });
  
  it('should initialize with correct headers', () => {
    const transport = new HTTPStreamTransport('/test', res);
    
    expect(statusCode).toBe(200);
    expect(res.headers?.['content-type']).toBe('application/json');
    expect(res.headers?.['transfer-encoding']).toBe('chunked');
    expect(res.headers?.['connection']).toBe('keep-alive');
    expect(res.headers?.['cache-control']).toBe('no-cache');
  });
  
  it('should send messages correctly', async () => {
    const transport = new HTTPStreamTransport('/test', res);
    
    await transport.send({ type: 'test', message: 'Hello, world!' });
    
    expect(responseData.length).toBe(1);
    const sentData = JSON.parse(responseData[0].trim());
    expect(sentData.type).toBe('test');
    expect(sentData.message).toBe('Hello, world!');
  });
  
  it('should process incoming messages', async () => {
    const transport = new HTTPStreamTransport('/test', res);
    
    let receivedMessage: any = null;
    transport.onMessage(async (message) => {
      receivedMessage = message;
    });
    
    await transport.processMessage({ type: 'incoming', data: 'test data' });
    
    expect(receivedMessage).toEqual({ type: 'incoming', data: 'test data' });
  });
  
  it('should close the transport', async () => {
    const transport = new HTTPStreamTransport('/test', res);
    
    let closed = false;
    res.on('close', () => {
      closed = true;
    });
    
    await transport.close();
    
    expect(headersSent).toBe(true);
    
    // Try to send after closing
    await transport.send({ type: 'test', message: 'Should not be sent' });
    
    // Should still have only the initial data
    expect(responseData.length).toBe(0);
  });
  
  it('should implement start and stop methods', async () => {
    const transport = new HTTPStreamTransport('/test', res);
    
    // These methods should exist and not throw errors
    await transport.start();
    await transport.stop();
    
    // After stop, the transport should be closed
    expect(headersSent).toBe(true);
  });
});
