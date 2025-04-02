#!/bin/bash

# Kill any existing processes on the inspector ports
echo "Cleaning up existing processes..."
lsof -i :6274 -t | xargs kill -9 2>/dev/null || true
lsof -i :6277 -t | xargs kill -9 2>/dev/null || true

# Set environment variables
export MCP_SERVER_URL=http://localhost:5001/sse
export MCP_SERVER_HOST=localhost
export MCP_SERVER_PORT=5001
export MCP_SERVER_PATH=/sse
export MCP_PROTOCOL_VERSION=2024-11-05
export NODE_ENV=development
export DEBUG=mcp:*,eventsource:*
export LOG_LEVEL=debug

# Verify MCP server is running
echo "Verifying MCP server is running..."
if ! curl -s http://localhost:5001/health > /dev/null; then
  echo "Error: MCP server is not running on port 5001"
  echo "Please start the MCP server first"
  exit 1
fi

# Run the inspector with explicit configuration
echo "Starting MCP Inspector..."
echo "MCP server URL: $MCP_SERVER_URL"
npx @modelcontextprotocol/inspector
