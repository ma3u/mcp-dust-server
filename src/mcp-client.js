#!/usr/bin/env node
// src/mcp-client.js - A simple client for testing the MCP Dust server

const { spawn } = require('child_process');
const readline = require('readline');
const path = require('path');
require('dotenv').config();

// Colors for console output
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m"
};

// Print a formatted heading
function printHeading(text) {
  console.log(`\n${colors.blue}${colors.bright}${text}${colors.reset}`);
  console.log("=".repeat(text.length));
}

// Process command line arguments
const queryArg = process.argv[2];
const query = queryArg || "Tell me about the P4XAI-1 ticket for connecting Windsurf IDE with GitHub and Atlassian services";

// Start the MCP server
printHeading("Starting MCP Dust Server");
console.log(`Using query: "${colors.yellow}${query}${colors.reset}"`);

// Use standalone mode or spawn the server
let serverProcess;
let serverStarted = false;

function sendRequest(stdin, method, params = {}) {
  const request = {
    jsonrpc: "2.0",
    id: Date.now(),
    method,
    params
  };
  
  const requestStr = JSON.stringify(request);
  console.log(`${colors.cyan}Sending request:${colors.reset} ${method}`);
  stdin.write(requestStr + "\n");
}

async function main() {
  try {
    // Launch the server
    console.log(`${colors.green}Launching server process...${colors.reset}`);
    serverProcess = spawn('npx', ['ts-node', path.join(__dirname, 'server.ts')], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    // Set up readline interface for server process
    const rlServer = readline.createInterface({
      input: serverProcess.stdout,
      terminal: false
    });
    
    // Handle server output
    rlServer.on('line', (line) => {
      // Skip empty lines
      if (!line.trim()) return;
      
      // Try to parse as JSON
      try {
        const response = JSON.parse(line);
        
        if (response.jsonrpc === "2.0") {
          // This is a JSON-RPC response
          console.log(`\n${colors.green}${colors.bright}Received response:${colors.reset}`);
          
          if (response.result) {
            // Success response
            if (response.result.content && response.result.content[0] && response.result.content[0].text) {
              console.log(`${colors.bright}${response.result.content[0].text}${colors.reset}`);
            } else {
              console.log(JSON.stringify(response.result, null, 2));
            }
          } else if (response.error) {
            // Error response
            console.log(`${colors.red}Error: ${response.error.message}${colors.reset}`);
            console.log(JSON.stringify(response.error, null, 2));
          }
        }
      } catch (e) {
        // Not JSON, treat as server log
        if (line.includes("MCP Server running")) {
          serverStarted = true;
          console.log(`${colors.green}${colors.bright}Server successfully started!${colors.reset}`);
        }
        console.log(`${colors.green}${line}${colors.reset}`);
      }
    });
    
    // Handle server errors
    serverProcess.stderr.on('data', (data) => {
      console.error(`${colors.red}[Server Error] ${data.toString().trim()}${colors.reset}`);
    });
    
    // Wait for server to start
    console.log(`${colors.yellow}Waiting for server to start...${colors.reset}`);
    await new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (serverStarted) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
      
      // Timeout after 10 seconds
      setTimeout(() => {
        if (!serverStarted) {
          clearInterval(checkInterval);
          console.log(`${colors.yellow}Timeout waiting for server start confirmation, proceeding anyway...${colors.reset}`);
          resolve();
        }
      }, 10000);
    });
    
    // Give the server a moment to initialize
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Test getInfo
    printHeading("Getting Server Info");
    sendRequest(serverProcess.stdin, "getInfo");
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Test tools.list
    printHeading("Listing Available Tools");
    sendRequest(serverProcess.stdin, "tools.list");
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Test echo tool
    printHeading("Testing Echo Tool");
    sendRequest(serverProcess.stdin, "tools.execute", {
      name: "echo",
      parameters: {
        message: "Hello from MCP test client!"
      }
    });
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Test dust-query tool
    printHeading("Testing Dust Query Tool");
    console.log(`${colors.yellow}Sending query: "${query}"${colors.reset}`);
    console.log(`${colors.yellow}This may take up to 30 seconds...${colors.reset}`);
    
    sendRequest(serverProcess.stdin, "tools.execute", {
      name: "dust-query",
      parameters: {
        query
      }
    });
    
    // Wait longer for the dust query response
    await new Promise(resolve => setTimeout(resolve, 30000));
    
  } catch (error) {
    console.error(`${colors.red}${colors.bright}Error:${colors.reset}`, error);
  } finally {
    // Clean up
    if (serverProcess) {
      console.log(`\n${colors.blue}Shutting down server...${colors.reset}`);
      serverProcess.kill();
    }
    
    console.log(`\n${colors.green}${colors.bright}Test completed!${colors.reset}`);
  }
}

// Run the main function
main().catch(error => {
  console.error(`${colors.red}Unhandled error:${colors.reset}`, error);
  if (serverProcess) serverProcess.kill();
  process.exit(1);
});
