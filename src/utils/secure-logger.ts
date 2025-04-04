// src/utils/secure-logger.ts
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface LoggerOptions {
  /** Sensitive keys to mask in logs */
  sensitiveKeys?: string[];
  /** Pattern to use for masking sensitive values */
  maskPattern?: string;
  /** Whether to include timestamps in logs */
  timestamps?: boolean;
  /** Minimum log level to output */
  minLevel?: LogLevel;
  /** Log file path */
  logFilePath?: string;
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
  private logFilePath: string;
  private logFileStream: fs.WriteStream | null = null;

  constructor(options: LoggerOptions = {}) {
    this.sensitiveKeys = options.sensitiveKeys || [
      'apiKey', 'api_key', 'key', 'token', 'secret', 'password', 'credential',
      'authorization', 'auth', 'private', 'access_token', 'refresh_token'
    ];
    this.maskPattern = options.maskPattern || '********';
    this.timestamps = options.timestamps !== undefined ? options.timestamps : true;
    this.minLevel = options.minLevel || LogLevel.INFO;
    
    // Set up log file path (default to project's logs directory)
    // Ensure we're using a relative path within the project
    const projectRoot = process.cwd();
    this.logFilePath = options.logFilePath || path.resolve(
      projectRoot, 
      'logs',
      'mcp-server.log'
    );
    
    // Ensure log directory exists
    const logDir = path.dirname(this.logFilePath);
    console.error(`Log directory path: ${logDir}`);
    if (!fs.existsSync(logDir)) {
      try {
        fs.mkdirSync(logDir, { recursive: true });
        console.error(`Created log directory: ${logDir}`);
      } catch (err) {
        console.error(`Error creating log directory: ${err}`);
        // Fallback to a directory we know exists
        this.logFilePath = path.join(projectRoot, 'mcp-server.log');
        console.error(`Falling back to log file: ${this.logFilePath}`);
      }
    }
    
    // Create or open log file stream
    this.openLogFile();
    
    // Handle process exit to close log file
    process.on('exit', () => this.closeLogFile());
    process.on('SIGINT', () => {
      this.closeLogFile();
      process.exit(0);
    });
  }
  
  /**
   * Open the log file for writing
   */
  private openLogFile(): void {
    try {
      this.logFileStream = fs.createWriteStream(this.logFilePath, { flags: 'a' });
      this.writeToLog(`Log file opened at ${new Date().toISOString()}\n`);
    } catch (error) {
      // If we can't open the log file, we'll have to use stderr
      process.stderr.write(`Failed to open log file: ${error}\n`);
    }
  }
  
  /**
   * Close the log file
   */
  private closeLogFile(): void {
    if (this.logFileStream) {
      this.logFileStream.end(`Log file closed at ${new Date().toISOString()}\n`);
      this.logFileStream = null;
    }
  }
  
  /**
   * Write to log file
   */
  private writeToLog(message: string): void {
    if (this.logFileStream) {
      this.logFileStream.write(message + '\n');
    } else {
      // Fallback to stderr if log file is not available
      // This should only happen if there's an issue with the log file
      process.stderr.write(message + '\n');
    }
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
      const formattedMsg = this.formatMessage(`🔍 DEBUG: ${message}`);
      const dataStr = maskedData.length > 0 ? ` ${JSON.stringify(maskedData)}` : '';
      this.writeToLog(`${formattedMsg}${dataStr}`);
    }
  }

  /**
   * Log an info message
   */
  info(message: string, ...data: any[]): void {
    if (this.minLevel <= LogLevel.INFO) {
      const maskedData = data.map(item => this.maskSensitiveData(item));
      const formattedMsg = this.formatMessage(`ℹ️ INFO: ${message}`);
      const dataStr = maskedData.length > 0 ? ` ${JSON.stringify(maskedData)}` : '';
      this.writeToLog(`${formattedMsg}${dataStr}`);
    }
  }

  /**
   * Log a warning message
   */
  warn(message: string, ...data: any[]): void {
    if (this.minLevel <= LogLevel.WARN) {
      const maskedData = data.map(item => this.maskSensitiveData(item));
      const formattedMsg = this.formatMessage(`⚠️ WARN: ${message}`);
      const dataStr = maskedData.length > 0 ? ` ${JSON.stringify(maskedData)}` : '';
      this.writeToLog(`${formattedMsg}${dataStr}`);
    }
  }

  /**
   * Log an error message
   */
  error(message: string, ...data: any[]): void {
    if (this.minLevel <= LogLevel.ERROR) {
      const maskedData = data.map(item => this.maskSensitiveData(item));
      const formattedMsg = this.formatMessage(`🔴 ERROR: ${message}`);
      const dataStr = maskedData.length > 0 ? ` ${JSON.stringify(maskedData)}` : '';
      this.writeToLog(`${formattedMsg}${dataStr}`);
    }
  }

  /**
   * Log MCP request with sensitive data masked
   */
  logRequest(request: any): void {
    if (this.minLevel <= LogLevel.INFO) {
      const maskedRequest = this.maskSensitiveData(request);
      const formattedMsg = this.formatMessage('🔵 MCP REQUEST:');
      this.writeToLog(`${formattedMsg} ${JSON.stringify(maskedRequest, null, 2)}`);
    }
  }

  /**
   * Log MCP response with sensitive data masked
   */
  logResponse(response: any): void {
    if (this.minLevel <= LogLevel.INFO) {
      const maskedResponse = this.maskSensitiveData(response);
      const formattedMsg = this.formatMessage('🟢 MCP RESPONSE:');
      this.writeToLog(`${formattedMsg} ${JSON.stringify(maskedResponse, null, 2)}`);
    }
  }
}

// Export default instance with standard configuration
export const logger = new SecureLogger();
