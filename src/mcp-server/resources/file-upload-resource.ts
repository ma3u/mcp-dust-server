/**
 * @fileoverview File Upload Resource for MCP Server
 * 
 * This module implements a file upload resource for the MCP server,
 * allowing clients to upload, retrieve, and manage files.
 * 
 * @author Ma3u
 * @project P4XAI
 * @jira P4XAI-50
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fileUploadService } from "../../utils/file-upload-service.js";
import { logger } from "../../utils/secure-logger.js";
import express from "express";
import multer from "multer";
import path from "path";
import crypto from "crypto";

/**
 * Configure multer for memory storage
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760', 10), // 10MB default
  }
});

/**
 * Registers file upload resources and routes with the MCP server and Express app
 * 
 * @param mcpServer - The MCP server instance
 * @param app - The Express app instance
 */
export function registerFileUploadResources(mcpServer: McpServer, app: express.Application): void {
  logger.info('Registering file upload resources');
  
  // Register the file upload resource with the MCP server
  mcpServer.resource("file", "file://", async (uri: URL, context: { sessionId?: string }) => {
    const sessionId = (context && 'sessionId' in context) ? context.sessionId as string : undefined;
    
    if (!sessionId) {
      logger.warn('File resource accessed without session ID');
      throw new Error('Session ID is required for file access');
    }
    
    // Parse the URI to get the file ID
    const fileId = uri.pathname.trim();
    
    if (!fileId) {
      logger.warn(`Invalid file path: ${uri.pathname}`);
      throw new Error('Invalid file path');
    }
    
    try {
      // Get the file from the service
      const { content, metadata } = fileUploadService.getFile(fileId, sessionId);
      logger.info(`File resource accessed: ${fileId}, session: ${sessionId}`);
      
      // Return the file contents in the format expected by MCP SDK
      return {
        contents: [
          {
            uri: `file://${fileId}`,
            text: content.toString('base64'),
            mimeType: metadata.mimeType
          }
        ]
      };
    } catch (error) {
      logger.error(`Error accessing file resource: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  });
  
  // Add Express routes for file upload and management
  
  // Upload endpoint
  app.post('/api/v1/files/upload', upload.single('file'), (req: express.Request & { file?: Express.Multer.File, mcpSessionId?: string }, res: express.Response) => {
    try {
      // Check if file exists
      if (!req.file) {
        logger.warn('File upload attempted without file');
        return res.status(400).json({ error: 'No file uploaded' });
      }
      
      // Get session ID from request
      const sessionId = req.mcpSessionId;
      
      if (!sessionId) {
        logger.warn('File upload attempted without session ID');
        return res.status(401).json({ error: 'Session ID is required' });
      }
      
      // Store the file
      const metadata = fileUploadService.storeFile(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype,
        sessionId
      );
      
      // Return success response
      return res.status(201).json({
        id: metadata.id,
        originalName: metadata.originalName,
        mimeType: metadata.mimeType,
        size: metadata.size,
        uploadedAt: metadata.uploadedAt,
        expiresAt: metadata.expiresAt,
        resourcePath: `file:${metadata.id}`
      });
    } catch (error) {
      logger.error(`Error uploading file: ${error instanceof Error ? error.message : String(error)}`);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });
  
  // List files endpoint
  app.get('/api/v1/files', (req: express.Request & { mcpSessionId?: string }, res: express.Response) => {
    try {
      // Get session ID from request
      const sessionId = req.mcpSessionId;
      
      if (!sessionId) {
        logger.warn('File list attempted without session ID');
        return res.status(401).json({ error: 'Session ID is required' });
      }
      
      // List files for this session
      const files = fileUploadService.listFiles(sessionId);
      
      // Map to response format
      const response = files.map(file => ({
        id: file.id,
        originalName: file.originalName,
        mimeType: file.mimeType,
        size: file.size,
        uploadedAt: file.uploadedAt,
        expiresAt: file.expiresAt,
        resourcePath: `file:${file.id}`
      }));
      
      return res.status(200).json(response);
    } catch (error) {
      logger.error(`Error listing files: ${error instanceof Error ? error.message : String(error)}`);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });
  
  // Delete file endpoint
  app.delete('/api/v1/files/:id', (req: express.Request & { mcpSessionId?: string }, res: express.Response) => {
    try {
      // Get file ID from request
      const fileId = req.params.id;
      
      // Get session ID from request
      const sessionId = req.mcpSessionId;
      
      if (!sessionId) {
        logger.warn('File deletion attempted without session ID');
        return res.status(401).json({ error: 'Session ID is required' });
      }
      
      // Delete the file
      const success = fileUploadService.deleteFile(fileId, sessionId);
      
      if (success) {
        return res.status(204).end();
      } else {
        return res.status(404).json({ error: 'File not found or access denied' });
      }
    } catch (error) {
      logger.error(`Error deleting file: ${error instanceof Error ? error.message : String(error)}`);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });
  
  // Add file upload to capabilities
  // Add file resource to capabilities if possible
  // Note: This might need to be adjusted based on the actual MCP server implementation
  const mcpServerAny = mcpServer as any;
  if (mcpServerAny.capabilities) {
    mcpServerAny.capabilities.resources = mcpServerAny.capabilities.resources || [];
    if (!mcpServerAny.capabilities.resources.includes('file')) {
      mcpServerAny.capabilities.resources.push('file');
    }
  }
  
  logger.info('File upload resources registered');
}
