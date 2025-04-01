// src/utils/secure-logger.ts
export interface LoggerOptions {
  /** Sensitive keys to mask in logs */
  sensitiveKeys?: string[];
  /** Pattern to use for masking sensitive values */
  maskPattern?: string;
  /** Whether to include timestamps in logs */
  timestamps?: boolean;
  /** Minimum log level to output */
  minLevel?: LogLevel;
}

/** Supported log levels */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

/** Logger implementation with sensitivity masking */
export class SecureLogger {
  private sensitiveKeys: string[];
  private maskPattern: string;
  private timestamps: boolean;
  private minLevel: LogLevel;

  constructor(options: LoggerOptions = {}) {
    this.sensitiveKeys = options.sensitiveKeys || [
      'apiKey', 'api_key', 'key', 'token', 'secret', 'password', 'credential',
      'authorization', 'auth', 'private', 'access_token', 'refresh_token'
    ];
    this.maskPattern = options.maskPattern || '********';
    this.timestamps = options.timestamps !== undefined ? options.timestamps : true;
    this.minLevel = options.minLevel || LogLevel.INFO;
  }

  /**
   * Recursively mask sensitive values in an object
   */
  private maskSensitiveData(data: any): any {
    if (data === null || data === undefined) {
      return data;
    }

    // Handle different data types
    if (typeof data !== 'object') {
      return data;
    }

    // Handle arrays
    if (Array.isArray(data)) {
      return data.map(item => this.maskSensitiveData(item));
    }

    // Handle objects
    const maskedData = { ...data };
    
    for (const key in maskedData) {
      if (this.sensitiveKeys.some(sensitiveKey => 
        key.toLowerCase().includes(sensitiveKey.toLowerCase()))) {
        maskedData[key] = this.maskPattern;
      } else if (typeof maskedData[key] === 'object' && maskedData[key] !== null) {
        maskedData[key] = this.maskSensitiveData(maskedData[key]);
      }
    }

    return maskedData;
  }

  /**
   * Format message with timestamp
   */
  private formatMessage(message: string): string {
    if (this.timestamps) {
      const timestamp = new Date().toISOString();
      return `[${timestamp}] ${message}`;
    }
    return message;
  }

  /**
   * Log a debug message
   */
  debug(message: string, ...data: any[]): void {
    if (this.minLevel <= LogLevel.DEBUG) {
      const maskedData = data.map(item => this.maskSensitiveData(item));
      console.debug(this.formatMessage(`🔍 DEBUG: ${message}`), ...maskedData);
    }
  }

  /**
   * Log an info message
   */
  info(message: string, ...data: any[]): void {
    if (this.minLevel <= LogLevel.INFO) {
      const maskedData = data.map(item => this.maskSensitiveData(item));
      console.info(this.formatMessage(`ℹ️ INFO: ${message}`), ...maskedData);
    }
  }

  /**
   * Log a warning message
   */
  warn(message: string, ...data: any[]): void {
    if (this.minLevel <= LogLevel.WARN) {
      const maskedData = data.map(item => this.maskSensitiveData(item));
      console.warn(this.formatMessage(`⚠️ WARN: ${message}`), ...maskedData);
    }
  }

  /**
   * Log an error message
   */
  error(message: string, ...data: any[]): void {
    if (this.minLevel <= LogLevel.ERROR) {
      const maskedData = data.map(item => this.maskSensitiveData(item));
      console.error(this.formatMessage(`🔴 ERROR: ${message}`), ...maskedData);
    }
  }

  /**
   * Log MCP request with sensitive data masked
   */
  logRequest(request: any): void {
    if (this.minLevel <= LogLevel.INFO) {
      const maskedRequest = this.maskSensitiveData(request);
      console.info(this.formatMessage('🔵 MCP REQUEST:'), JSON.stringify(maskedRequest, null, 2));
    }
  }

  /**
   * Log MCP response with sensitive data masked
   */
  logResponse(response: any): void {
    if (this.minLevel <= LogLevel.INFO) {
      const maskedResponse = this.maskSensitiveData(response);
      console.info(this.formatMessage('🟢 MCP RESPONSE:'), JSON.stringify(maskedResponse, null, 2));
    }
  }
}

// Export default instance with standard configuration
export const logger = new SecureLogger();
