#!/usr/bin/env node

/**
 * Universal server launcher for MCP-Dust server
 * Works in both development and production environments
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { createInterface } from 'readline';
import fs from 'fs';
import path from 'path';

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');

// Parse command line arguments
const args = process.argv.slice(2);
const isDev = args.includes('--dev');
const instanceCount = parseInt(args.find(arg => !arg.startsWith('--')) || '1', 10);
const useRedis = args.includes('--redis');

// Store all child processes
const instances = [];

// Base environment configuration
function createInstanceEnv(index) {
  return {
    ...process.env,
    START_MODE: 'server',
    INSTANCE_ID: `${isDev ? 'dev' : 'prod'}-instance-${index}`,
    MCP_MIN_PORT: '5001',
    MCP_MAX_PORT: '5050',
    MCP_PREFERRED_PORT: `${5001 + index}`,
    USE_REDIS_REGISTRY: useRedis ? 'true' : 'false',
    DEBUG: isDev ? 'true' : 'false'
  };
}

console.log(`Starting ${instanceCount} MCP server instance${instanceCount > 1 ? 's' : ''} in ${isDev ? 'development' : 'production'} mode...`);
console.log(`Using ${useRedis ? 'Redis' : 'in-memory'} service registry`);
console.log('Press Ctrl+C to stop all servers');

/**
 * Start a single MCP server instance
 * 
 * @param {number} index Instance index (used for identification)
 * @returns {Promise<ChildProcess>} The child process
 */
function startInstance(index) {
  return new Promise((resolve) => {
    // Create environment for this instance
    const env = createInstanceEnv(index);
    
    // Determine command and arguments based on environment
    let command, args;
    
    if (isDev) {
      // Development mode - use ts-node with proper ESM flags
      env.NODE_OPTIONS = '--loader ts-node/esm';
      command = 'node';
      args = ['src/index.ts'];
    } else {
      // Production mode - run compiled JavaScript
      command = 'node';
      args = ['dist/index.js'];
    }
    
    // Start the server process
    const serverProcess = spawn(command, args, {
      cwd: projectRoot,
      env,
      stdio: 'pipe' // Capture stdout/stderr for prefixing
    });
    
    // Add instance ID to each log line for easier identification
    const prefix = instanceCount > 1 ? `[Instance ${index}] ` : '';
    
    // Handle stdout
    serverProcess.stdout.on('data', (data) => {
      const lines = data.toString().trim().split('\n');
      lines.forEach(line => console.log(`${prefix}${line}`));
    });

    // Handle stderr
    serverProcess.stderr.on('data', (data) => {
      const lines = data.toString().trim().split('\n');
      lines.forEach(line => console.error(`${prefix}${line}`));
    });

    // Handle process exit
    serverProcess.on('exit', (code, signal) => {
      console.log(`${prefix}Process exited with code ${code} and signal ${signal}`);
      
      // Remove from instances array
      const idx = instances.indexOf(serverProcess);
      if (idx !== -1) {
        instances.splice(idx, 1);
      }
      
      // If all instances have exited, exit the launcher
      if (instances.length === 0) {
        console.log('All instances have exited. Shutting down.');
        process.exit(0);
      }
    });

    // Wait a bit before resolving to allow for startup logs
    setTimeout(() => {
      console.log(`${prefix}Started with PID ${serverProcess.pid}`);
      resolve(serverProcess);
    }, 500);
  });
}

/**
 * Start all MCP server instances
 */
async function startAllInstances() {
  try {
    // Check if we need to build first (for production mode)
    if (!isDev) {
      const distDir = path.join(projectRoot, 'dist');
      if (!fs.existsSync(distDir) || !fs.existsSync(path.join(distDir, 'index.js'))) {
        console.log('Building project first...');
        await new Promise((resolve, reject) => {
          const buildProcess = spawn('npm', ['run', 'build'], {
            cwd: projectRoot,
            stdio: 'inherit'
          });
          
          buildProcess.on('exit', (code) => {
            if (code === 0) {
              resolve();
            } else {
              reject(new Error(`Build failed with code ${code}`));
            }
          });
        });
        console.log('Build completed.');
      }
    }
    
    // Start instances sequentially to avoid port conflicts
    for (let i = 0; i < instanceCount; i++) {
      const instance = await startInstance(i);
      instances.push(instance);
      
      // Wait a bit between instances to allow for port negotiation
      if (i < instanceCount - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    console.log(`Successfully started ${instances.length} MCP server instance${instances.length > 1 ? 's' : ''}`);
  } catch (error) {
    console.error('Error starting instances:', error);
    process.exit(1);
  }
}

/**
 * Gracefully shut down all instances
 */
function shutdownAllInstances() {
  console.log('Shutting down all instances...');
  
  // Send SIGTERM to all instances
  instances.forEach((instance, index) => {
    console.log(`Stopping instance ${index}...`);
    instance.kill('SIGTERM');
  });
  
  // Force exit after a timeout
  setTimeout(() => {
    console.log('Force exiting after timeout');
    process.exit(1);
  }, 5000);
}

// Handle SIGINT (Ctrl+C)
process.on('SIGINT', shutdownAllInstances);

// Handle SIGTERM
process.on('SIGTERM', shutdownAllInstances);

// Setup readline interface for interactive commands
const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: 'mcp> '
});

// Start all instances
startAllInstances().then(() => {
  rl.prompt();

  rl.on('line', (line) => {
    const command = line.trim();
    
    switch (command) {
      case 'status':
        console.log(`Running ${instances.length} instance${instances.length !== 1 ? 's' : ''}`);
        instances.forEach((instance, index) => {
          console.log(`Instance ${index}: PID ${instance.pid}`);
        });
        break;
        
      case 'stop':
        shutdownAllInstances();
        break;
        
      case 'help':
        console.log('Available commands:');
        console.log('  status - Show status of running instances');
        console.log('  stop   - Stop all instances');
        console.log('  help   - Show this help');
        console.log('  exit   - Exit the launcher (same as Ctrl+C)');
        break;
        
      case 'exit':
        shutdownAllInstances();
        break;
        
      default:
        console.log(`Unknown command: ${command}`);
        console.log('Type "help" for available commands');
    }
    
    rl.prompt();
  }).on('close', () => {
    shutdownAllInstances();
  });
});
