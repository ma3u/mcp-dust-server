# MCP Dust Server - Developer Documentation

This document contains technical information for developers working with the MCP Dust Server.

## Table of Contents

- [Project Structure](#project-structure)
- [Project Progress](#project-progress)
- [API Endpoints](#api-endpoints)
  - [MCP Server Endpoints](#mcp-server-endpoints)
  - [Health Check Endpoints](#health-check-endpoints)
  - [MCP Protocol Endpoints](#mcp-protocol-endpoints)
  - [Transport Mechanisms](#transport-mechanisms)
  - [MCP Tools](#mcp-tools)
- [Debugging with MCP Inspector](#debugging-with-mcp-inspector)
  - [Installing MCP Inspector](#installing-mcp-inspector)
  - [Using the Inspector](#using-the-inspector)
  - [Connection Flow](#connection-flow)
  - [Inspector Features](#inspector-features)
  - [Using MCP Inspector with stdio Transport](#using-mcp-inspector-with-stdio-transport)
  - [Troubleshooting Common Issues](#troubleshooting-common-issues)
  - [Best Practices](#best-practices)
- [Testing](#testing)
  - [Web Client Testing](#web-client-testing)
  - [Command-Line Testing](#command-line-testing)
  - [Connection Status Indicators](#connection-status-indicators)
  - [Heartbeat Mechanism](#heartbeat-mechanism)
- [Security Considerations](#security-considerations)

## Project Progress

The MCP Dust Server is under active development. You can track the progress and upcoming features in the following documents:

- [Project Plan](../prd.md) - Detailed project phases and roadmap
- [Todo List](../todo.md) - Prioritized task list with completion status

The project is organized into several phases:

1. **Project Setup** - Repository configuration, CI/CD pipeline
2. **Core Server Implementation** - MCP server foundation, session management
3. **Dust Integration** - Agent communication, tool mapping
4. **Transport Layer** - SSE implementation, HTTP streaming
5. **Testing & Security** - Compliance tests, rate limiting, error handling

## Project Structure

```text
src/
├── mcp-server/
│   ├── index.ts            # MCP server entry point
│   └── server.ts           # MCP server implementation
├── mcp-client/
│   └── client-server.ts    # Test client implementation
├── utils/
│   ├── dust-client.ts      # Dust API client wrapper
│   ├── dust-test-client.ts # Dust API test client
│   ├── test-run-method.ts  # JSON-RPC 'run' method test script
│   ├── secure-logger.ts    # PII-masking secure logger
│   ├── session-manager.ts  # Session management implementation
│   └── http-stream-transport.ts # HTTP Stream Transport implementation
├── index.ts               # Main entry point
└── types/
    └── index.ts           # TypeScript type definitions
public/
├── test-sse.html          # Web-based test client
├── styles.css             # Client styles
└── favicon.ico            # Site favicon
dist/                      # Compiled JavaScript output
tests/                     # Test suite
```

## API Endpoints

### MCP Server Endpoints

- `GET /health` - Server health check endpoint
- `GET /live` - Server liveness check endpoint
- `GET /ready` - Server readiness check endpoint
- `GET /sse` - Establish SSE connection with automatic heartbeat
- `POST /stream` - HTTP Stream Transport endpoint for bidirectional communication
  - Supports JSON-RPC methods: 'initialize', 'message', 'terminate', and 'run'
  - Direct tool execution via the 'run' method
- `GET /debug/sessions` - View active session information (development only)
- `GET /debug/connections` - View active connection information (development only)

### Health Check Endpoints

- **GET /health**: Returns the server's health status

  ```json
  {
    "status": "healthy",
    "version": "1.0.0",
    "timestamp": "2025-04-02T16:34:16.989Z",
    "component": "MCP Server",
    "activeSessions": 0
  }
  ```

- **GET /ready**: Indicates if the server is ready to accept connections

  ```json
  {
    "status": "ready",
    "version": "1.0.0",
    "timestamp": "2025-04-02T16:34:16.989Z"
  }
  ```

- **GET /live**: Indicates if the server is alive

  ```json
  {
    "status": "alive",
    "uptime": 123.45,
    "timestamp": "2025-04-02T16:34:16.989Z"
  }
  ```

- **GET /api/v1/status**: Returns operational status and configuration details

  ```json
  {
    "status": "operational",
    "version": "1.0.0",
    "workspace": "11453f1c9e",
    "agent": "8x9nuWdMnR",
    "uptime": 123.45
  }
  ```

### MCP Protocol Endpoints

- **GET /sse**: Server-Sent Events endpoint for real-time streaming
- **POST /stream**: HTTP Stream Transport endpoint according to MCP specification
- **POST /messages**: JSON-RPC endpoint for non-streaming MCP messages

### Transport Mechanisms

The server supports two transport mechanisms:

1. **SSE (Server-Sent Events)**: Used for real-time streaming from server to client
   - Automatic reconnection on connection loss
   - Heartbeat mechanism to prevent timeouts
   - Session tracking for context preservation

2. **HTTP Stream Transport**: Used for bidirectional communication
   - Chunked encoding for streaming responses
   - Session ID tracking via headers
   - Proper CORS configuration for cross-origin requests

### MCP Tools

1. **echo**
   - Description: Echoes back the provided message (for testing)
   - Parameters: `message` (string)
   - Access via: Tool call or direct 'run' method

2. **dust-query**
   - Description: Send a query to your Dust AI agent
   - Parameters: `query` (string)
   - Access via: Tool call or direct 'run' method

## Debugging with MCP Inspector

The MCP Inspector is a powerful debugging tool that helps you visualize and troubleshoot the communication between clients and your MCP server. It acts as a proxy between clients and your server, allowing you to inspect the messages being exchanged.

### Installing MCP Inspector

```bash
npm install -g @modelcontextprotocol/inspector
```

Or use it directly with npx:

```bash
npx @modelcontextprotocol/inspector
```

### Using the Inspector

To run the MCP Inspector, use the following command:

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

Replace `dist/index.js` with the path to your compiled server entry point.

This command will start the inspector and connect it to your MCP server using the stdio transport.

Once started, the MCP Inspector will be available at:

- Web UI: [http://127.0.0.1:6274](http://127.0.0.1:6274)
- Proxy Server: [http://127.0.0.1:6277](http://127.0.0.1:6277)

### Connection Flow

The MCP Inspector works by proxying connections between clients and your server:

```text
Client → MCP Inspector (6277) → Your MCP Server (5001)
```

### Inspector Features

1. **Messages Tab**: View the JSON-RPC messages being exchanged between clients and your server
2. **Logs Tab**: See detailed logs of the communication process
3. **Test Tab**: Send custom messages to your server for testing
4. **Sessions Tab**: Monitor active sessions and their state
5. **Configuration Tab**: View and modify the inspector's configuration

### Using MCP Inspector with stdio Transport

Claude Desktop only supports MCP servers using the stdio transport. If you need to test your server with stdio transport for Claude Desktop compatibility, follow these steps:

#### 1. Ensure Your Server Supports stdio

Your server should be implemented using the `StdioServerTransport` from the MCP SDK. Here's an example in TypeScript:

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new McpServer({ name: "dust-server", version: "1.0.0" });

// Configure tools, resources, and prompts here

const transport = new StdioServerTransport();
await server.connect(transport);
```

#### 2. Start the MCP Inspector with stdio Transport

Run the following command in your terminal:

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

Replace `dist/index.js` with the path to your compiled server entry point.

#### 3. Configure MCP Inspector for stdio

1. Open the MCP Inspector UI in your browser (usually at [http://127.0.0.1:5173](http://127.0.0.1:5173))
2. Set the Transport Type to **STDIO**
3. Enter:
   - Command: `node`
   - Arguments: `dist/index.js`
4. Click Connect

#### 4. Verify Connection

- If your server is running correctly, you should see a successful connection message in the Inspector
- Any errors will appear in the "Error Output from MCP Server" section of the Inspector UI

#### stdio Transport Troubleshooting

1. **Connection Error: Is Your MCP Server Running?**
   - Ensure your server is running and configured for stdio
   - Check for any syntax or runtime errors in your server logs

2. **"SSE Connection Not Established" Error**
   - This error typically occurs when an SSE transport is mistakenly used instead of stdio
   - Ensure that:
     - The Inspector's transport type is set to STDIO
     - Your server uses StdioServerTransport

3. **Node.js Environment Issues**
   - Ensure you're using a compatible Node.js version (e.g., v22.x)
   - Verify that all required dependencies are installed (`npm install`)

### Troubleshooting Common Issues

#### Connection Issues with MCP Inspector

1. **Port Configuration Mismatch**:
   - **Symptom**: Server logs show a different port than what's configured in `.env`
   - **Cause**: The default port in code (6001) may override your `.env` configuration (5001)
   - **Solution**:
     - Ensure your `.env` file has consistent port configuration:

       ```env
       MCP_PORT=6001
       MCP_MIN_PORT=6001
       MCP_MAX_PORT=6050
       ```

     - Or override at runtime: `MCP_PORT=6001 npm run start:server`
     - Check `src/config/instance-config.ts` for default port values

2. **STDIO Transport Issues with MCP Inspector**:
   - **Symptom**: "Error: SSE connection not established" despite configuring stdio
   - **Cause**: MCP Inspector uses an internal SSE connection for its web interface
   - **Solution**:
     - Set `TRANSPORT_MODE=stdio` in your `.env` file
     - Start server with: `START_MODE=stdio npm run start:server`
     - Ensure no direct `process.stdout.write()` calls in your code
     - All logging should be redirected to stderr: `console.log = console.error`

3. **Multiple Response Headers Error**:
   - **Symptom**: "ERR_HTTP_HEADERS_SENT" in server logs
   - **Cause**: Multiple responses sent for a single request
   - **Solution**:
     - Check middleware for multiple response calls
     - Ensure proper error handling in request handlers
     - Verify that async functions properly await all promises

4. **Server Disconnects Immediately**:
   - **Symptom**: Connection established but immediately drops
   - **Cause**: Errors in request handlers or initialization
   - **Solution**:
     - Check your server's `onRequest` and `onResponse` handlers for errors
     - Verify that your server is properly handling the initialize method
     - Look for any uncaught exceptions in your server code

5. **Connection Refused**:
   - **Symptom**: Cannot connect to server at all
   - **Cause**: Server not running or wrong port
   - **Solution**:
     - Verify server is running: `lsof -i :<port>` (e.g., `lsof -i :6001`)
     - Check that the SSE endpoint is accessible: `curl http://localhost:6001/sse`
     - Ensure no firewall is blocking the connection

6. **Protocol Version Issues**:
   - **Symptom**: Connection established but messages fail
   - **Cause**: Version mismatch between server and inspector
   - **Solution**:
     - Make sure both your server and the inspector use the same protocol version (2024-11-05)
     - Check `protocolVersion` in your server configuration

### Best Practices

- Use the inspector during development to validate your server's compliance with the MCP specification
- Test different message types to ensure your server handles them correctly
- Check the response times to identify potential performance bottlenecks
- Use the inspector to debug client-server communication issues
- Verify that your server correctly implements the MCP lifecycle (initialize, message, terminate)
- Add additional debug logging to your server code when troubleshooting issues
- Check the server logs for any errors or warnings that might indicate issues

## Testing

### Web Client Testing

The project includes a web-based test client accessible at `http://localhost:6001` (or your configured CLIENT_PORT) when you run the client component. This web interface allows you to:

1. Connect to the MCP server via SSE with automatic reconnection
2. Send test echo messages to verify connectivity
3. Send queries to your Dust agent and receive streaming responses
4. View responses in real-time with detailed logging
5. Monitor connection status with visual indicators

### Command-Line Testing

The project includes command-line test scripts for testing different aspects of the server:

1. **Dust API Test Client**:

   ```bash
   npm run test:dust-client
   ```

   Tests direct interaction with the Dust API without going through the MCP server.

2. **JSON-RPC Run Method Test**:

   ```bash
   npm run test:run-method
   ```

   Tests the JSON-RPC 'run' method implementation for direct tool execution via the HTTP Stream transport.

### Connection Status Indicators

The test client includes visual indicators for connection status:

- **Connected**: Green status indicator, all action buttons enabled
- **Disconnected**: Red status indicator, action buttons disabled
- **Pending**: Yellow status indicator, action buttons disabled

### Heartbeat Mechanism

The server implements a heartbeat mechanism that sends periodic messages to keep the SSE connection alive. This helps prevent timeouts and ensures a stable connection between the client and server.

## Security Considerations

- **API Key Protection**: API keys are masked in logs to prevent accidental exposure
- **Session Management**: Sessions expire after inactivity to prevent resource leaks
- **CORS Configuration**: Proper CORS headers to control cross-origin requests
- **Input Validation**: All inputs are validated before processing
- **Error Handling**: Comprehensive error handling to prevent information leakage
- **Rate Limiting**: Basic rate limiting to prevent abuse
