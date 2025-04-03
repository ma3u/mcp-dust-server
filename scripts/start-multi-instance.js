#!/usr/bin/env node

/**
 * Multi-instance MCP Server launcher
 * 
 * This script launches multiple instances of the MCP server with dynamic port negotiation.
 * Each instance will find an available port within the configured range.
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
const DEFAULT_INSTANCE_COUNT = 3;
const MIN_PORT = 5001;
const MAX_PORT = 5050;

// Parse command line arguments
const args = process.argv.slice(2);
const instanceCount = parseInt(args[0], 10) || DEFAULT_INSTANCE_COUNT;

console.log(`Starting ${instanceCount} MCP server instances...`);
console.log(`Port range: ${MIN_PORT}-${MAX_PORT}`);
console.log('Press Ctrl+C to stop all instances');

// Store all child processes
const instances = [];

/**
 * Start a single MCP server instance
 * 
 * @param {number} index Instance index (used for identification)
 * @returns {Promise<ChildProcess>} The child process
 */
function startInstance(index) {
  return new Promise((resolve) => {
    // Environment variables for this instance
    const env = {
      ...process.env,
      START_MODE: 'server',
      INSTANCE_ID: `inst-${index}`,
      MCP_MIN_PORT: MIN_PORT.toString(),
      MCP_MAX_PORT: MAX_PORT.toString(),
      // Prefer a specific port based on the instance index, but will negotiate if not available
      MCP_PORT: (MIN_PORT + index).toString()
    };

    // Start the server process
    const serverProcess = spawn('node', ['dist/index.js'], {
      cwd: projectRoot,
      env,
      stdio: 'pipe' // Capture stdout/stderr
    });

    // Add instance ID to each log line for easier identification
    const prefix = `[Instance ${index}] `;
    
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
      const index = instances.indexOf(serverProcess);
      if (index !== -1) {
        instances.splice(index, 1);
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
    // Start instances sequentially to avoid port conflicts
    for (let i = 0; i < instanceCount; i++) {
      const instance = await startInstance(i);
      instances.push(instance);
      
      // Wait a bit between instances to allow for port negotiation
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log(`Successfully started ${instances.length} MCP server instances`);
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
process.on('SIGTERM', shutdownAllInstances);

// Start all instances
startAllInstances();

// Setup readline interface for interactive commands
const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: 'mcp-multi> '
});

rl.prompt();

rl.on('line', (line) => {
  const command = line.trim();
  
  switch (command) {
    case 'status':
      console.log(`Running ${instances.length} instances`);
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
