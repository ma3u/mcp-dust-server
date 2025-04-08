/**
 * @fileoverview File Upload Service for MCP Server
 * 
 * This module provides a temporary file storage service for the MCP server.
 * It handles file uploads, storage, retrieval, and cleanup of temporary files.
 * 
 * @author Ma3u
 * @project P4XAI
 * @jira P4XAI-50
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { logger } from './secure-logger.js';
import os from 'os';

/**
 * Configuration for the file upload service
 */
interface FileUploadConfig {
  /** Base directory for temporary file storage */
  tempDir: string;
  /** Maximum file size in bytes (default: 10MB) */
  maxFileSize: number;
  /** Time in milliseconds after which files are automatically deleted (default: 1 hour) */
  expirationTime: number;
  /** Allowed file extensions (empty array means all extensions are allowed) */
  allowedExtensions: string[];
}

/**
 * Metadata for a stored file
 */
interface FileMetadata {
  /** Unique ID for the file */
  id: string;
  /** Original filename */
  originalName: string;
  /** MIME type of the file */
  mimeType: string;
  /** Size of the file in bytes */
  size: number;
  /** Path to the stored file */
  path: string;
  /** Timestamp when the file was uploaded */
  uploadedAt: Date;
  /** Timestamp when the file will expire */
  expiresAt: Date;
  /** Session ID associated with this file */
  sessionId: string;
}

/**
 * File Upload Service for handling temporary file storage
 */
class FileUploadService {
  private config: FileUploadConfig;
  private files: Map<string, FileMetadata>;
  private cleanupInterval: NodeJS.Timeout | null;

  /**
   * Creates a new FileUploadService instance
   * @param config - Configuration options for the service
   */
  constructor(config?: Partial<FileUploadConfig>) {
    this.config = {
      tempDir: process.env.FILE_UPLOAD_DIR || path.join(os.tmpdir(), 'mcp-uploads'),
      maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760', 10), // 10MB default
      expirationTime: parseInt(process.env.FILE_EXPIRATION_TIME || '3600000', 10), // 1 hour default
      allowedExtensions: (process.env.ALLOWED_FILE_EXTENSIONS || '').split(',').filter(Boolean),
      ...config
    };
    
    this.files = new Map<string, FileMetadata>();
    this.cleanupInterval = null;
    
    // Ensure the temp directory exists
    this.ensureTempDir();
    
    // Start the cleanup interval
    this.startCleanupInterval();
    
    logger.info(`File Upload Service initialized with config: ${JSON.stringify({
      tempDir: this.config.tempDir,
      maxFileSize: this.config.maxFileSize,
      expirationTime: this.config.expirationTime,
      allowedExtensions: this.config.allowedExtensions
    })}`);
  }

  /**
   * Ensures the temporary directory exists
   * @private
   */
  private ensureTempDir(): void {
    try {
      if (!fs.existsSync(this.config.tempDir)) {
        fs.mkdirSync(this.config.tempDir, { recursive: true });
        logger.info(`Created temporary directory: ${this.config.tempDir}`);
      }
    } catch (error) {
      logger.error(`Failed to create temporary directory: ${error instanceof Error ? error.message : String(error)}`);
      throw new Error(`Failed to create temporary directory: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Starts the interval for cleaning up expired files
   * @private
   */
  private startCleanupInterval(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredFiles();
    }, Math.min(this.config.expirationTime / 2, 3600000)); // Run at half the expiration time or hourly, whichever is shorter
    
    logger.info(`File cleanup interval started, running every ${Math.min(this.config.expirationTime / 2, 3600000) / 1000} seconds`);
  }

  /**
   * Cleans up expired files
   * @private
   */
  private cleanupExpiredFiles(): void {
    const now = new Date();
    let cleanedCount = 0;
    
    for (const [id, metadata] of this.files.entries()) {
      if (now > metadata.expiresAt) {
        try {
          fs.unlinkSync(metadata.path);
          this.files.delete(id);
          cleanedCount++;
          logger.info(`Cleaned up expired file: ${id}, original name: ${metadata.originalName}`);
        } catch (error) {
          logger.error(`Failed to delete expired file ${id}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
    
    if (cleanedCount > 0) {
      logger.info(`Cleaned up ${cleanedCount} expired files`);
    }
  }

  /**
   * Validates if a file is allowed based on its extension and size
   * @param filename - Original filename
   * @param size - File size in bytes
   * @returns True if the file is allowed, false otherwise
   * @private
   */
  private validateFile(filename: string, size: number): boolean {
    // Check file size
    if (size > this.config.maxFileSize) {
      logger.warn(`File size ${size} exceeds maximum allowed size ${this.config.maxFileSize}`);
      return false;
    }
    
    // Check file extension if restrictions are set
    if (this.config.allowedExtensions.length > 0) {
      const ext = path.extname(filename).toLowerCase().substring(1);
      if (!this.config.allowedExtensions.includes(ext)) {
        logger.warn(`File extension ${ext} is not in the allowed list: ${this.config.allowedExtensions.join(', ')}`);
        return false;
      }
    }
    
    return true;
  }

  /**
   * Stores a file in the temporary storage
   * @param buffer - File content as a Buffer
   * @param originalName - Original filename
   * @param mimeType - MIME type of the file
   * @param sessionId - Session ID associated with this file
   * @returns Metadata for the stored file
   * @throws Error if the file is not allowed or storage fails
   */
  public storeFile(buffer: Buffer, originalName: string, mimeType: string, sessionId: string): FileMetadata {
    // Validate the file
    if (!this.validateFile(originalName, buffer.length)) {
      throw new Error(`File validation failed for ${originalName}`);
    }
    
    // Generate a unique ID for the file
    const id = crypto.randomUUID();
    const ext = path.extname(originalName);
    const filename = `${id}${ext}`;
    const filePath = path.join(this.config.tempDir, filename);
    
    try {
      // Write the file to disk
      fs.writeFileSync(filePath, buffer);
      
      // Create and store metadata
      const now = new Date();
      const metadata: FileMetadata = {
        id,
        originalName,
        mimeType,
        size: buffer.length,
        path: filePath,
        uploadedAt: now,
        expiresAt: new Date(now.getTime() + this.config.expirationTime),
        sessionId
      };
      
      this.files.set(id, metadata);
      
      logger.info(`File stored: ${id}, original name: ${originalName}, size: ${buffer.length}, session: ${sessionId}`);
      
      return metadata;
    } catch (error) {
      logger.error(`Failed to store file ${originalName}: ${error instanceof Error ? error.message : String(error)}`);
      throw new Error(`Failed to store file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Retrieves a file by its ID
   * @param id - ID of the file to retrieve
   * @param sessionId - Session ID for access control
   * @returns File metadata and content
   * @throws Error if the file is not found or access is denied
   */
  public getFile(id: string, sessionId: string): { metadata: FileMetadata, content: Buffer } {
    const metadata = this.files.get(id);
    
    if (!metadata) {
      logger.warn(`File not found: ${id}`);
      throw new Error(`File not found: ${id}`);
    }
    
    // Check session ID for access control
    if (metadata.sessionId !== sessionId) {
      logger.warn(`Access denied to file ${id} for session ${sessionId}`);
      throw new Error(`Access denied to file ${id}`);
    }
    
    try {
      const content = fs.readFileSync(metadata.path);
      logger.info(`File retrieved: ${id}, original name: ${metadata.originalName}, session: ${sessionId}`);
      return { metadata, content };
    } catch (error) {
      logger.error(`Failed to read file ${id}: ${error instanceof Error ? error.message : String(error)}`);
      throw new Error(`Failed to read file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Deletes a file by its ID
   * @param id - ID of the file to delete
   * @param sessionId - Session ID for access control
   * @returns True if the file was deleted, false otherwise
   */
  public deleteFile(id: string, sessionId: string): boolean {
    const metadata = this.files.get(id);
    
    if (!metadata) {
      logger.warn(`File not found for deletion: ${id}`);
      return false;
    }
    
    // Check session ID for access control
    if (metadata.sessionId !== sessionId) {
      logger.warn(`Access denied to delete file ${id} for session ${sessionId}`);
      return false;
    }
    
    try {
      fs.unlinkSync(metadata.path);
      this.files.delete(id);
      logger.info(`File deleted: ${id}, original name: ${metadata.originalName}, session: ${sessionId}`);
      return true;
    } catch (error) {
      logger.error(`Failed to delete file ${id}: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * Lists all files for a specific session
   * @param sessionId - Session ID to list files for
   * @returns Array of file metadata objects
   */
  public listFiles(sessionId: string): FileMetadata[] {
    const sessionFiles: FileMetadata[] = [];
    
    for (const metadata of this.files.values()) {
      if (metadata.sessionId === sessionId) {
        sessionFiles.push(metadata);
      }
    }
    
    logger.info(`Listed ${sessionFiles.length} files for session ${sessionId}`);
    return sessionFiles;
  }

  /**
   * Cleans up all files for a specific session
   * @param sessionId - Session ID to clean up files for
   * @returns Number of files deleted
   */
  public cleanupSessionFiles(sessionId: string): number {
    let deletedCount = 0;
    
    for (const [id, metadata] of this.files.entries()) {
      if (metadata.sessionId === sessionId) {
        try {
          fs.unlinkSync(metadata.path);
          this.files.delete(id);
          deletedCount++;
        } catch (error) {
          logger.error(`Failed to delete file ${id} during session cleanup: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
    
    logger.info(`Cleaned up ${deletedCount} files for session ${sessionId}`);
    return deletedCount;
  }

  /**
   * Stops the cleanup interval and performs cleanup
   */
  public shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    
    // Clean up all files
    for (const [id, metadata] of this.files.entries()) {
      try {
        fs.unlinkSync(metadata.path);
        logger.info(`Deleted file during shutdown: ${id}`);
      } catch (error) {
        logger.error(`Failed to delete file ${id} during shutdown: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    this.files.clear();
    logger.info('File Upload Service shut down');
  }
}

// Create and export a singleton instance
const fileUploadService = new FileUploadService();

// Handle process exit to clean up files
process.on('exit', () => {
  fileUploadService.shutdown();
});

process.on('SIGINT', () => {
  fileUploadService.shutdown();
  process.exit(0);
});

process.on('SIGTERM', () => {
  fileUploadService.shutdown();
  process.exit(0);
});

export { fileUploadService, FileUploadService };
export type { FileMetadata };
