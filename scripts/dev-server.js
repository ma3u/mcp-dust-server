#!/usr/bin/env node

/**
 * Development server launcher for MCP-Dust server
 * 
 * This script provides a simpler way to run the development server
 * with the correct configuration.
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { createInterface } from 'readline';

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');

// Configuration
const env = {
  ...process.env,
  START_MODE: 'server',
  INSTANCE_ID: 'dev-instance',
  MCP_MIN_PORT: '5001',
  MCP_MAX_PORT: '5050',
  MCP_PORT: '5001',
  NODE_OPTIONS: '--loader ts-node/esm'
};

console.log('Starting MCP development server...');
console.log('Press Ctrl+C to stop the server');

// Start the server process
const serverProcess = spawn('node', ['src/index.ts'], {
  cwd: projectRoot,
  env,
  stdio: 'inherit' // Inherit stdio to see logs directly
});

// Handle process exit
serverProcess.on('exit', (code, signal) => {
  console.log(`Process exited with code ${code} and signal ${signal}`);
  process.exit(code || 0);
});

// Handle SIGINT (Ctrl+C)
process.on('SIGINT', () => {
  console.log('Shutting down development server...');
  serverProcess.kill('SIGTERM');
  
  // Force exit after a timeout
  setTimeout(() => {
    console.log('Force exiting after timeout');
    process.exit(1);
  }, 5000);
});

// Handle SIGTERM
process.on('SIGTERM', () => {
  console.log('Shutting down development server...');
  serverProcess.kill('SIGTERM');
});
