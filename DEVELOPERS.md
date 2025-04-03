# MCP Dust Server - Developer Documentation

This document contains technical information for developers working with the MCP Dust Server.

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

This repository includes a convenience script to run the MCP Inspector with the correct configuration:

```bash
./run-inspector.sh
```

This script will:

1. Clean up any existing inspector processes
2. Set the correct environment variables
3. Start the inspector with the right configuration

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

### Troubleshooting Common Issues

1. **Server Disconnects Immediately**:
   - Check your server's `onRequest` and `onResponse` handlers for errors
   - Verify that your server is properly handling the initialize method
   - Look for any uncaught exceptions in your server code

2. **Connection Refused**:
   - Ensure your server is running on port 5001
   - Check that the SSE endpoint is accessible at [http://localhost:5001/sse](http://localhost:5001/sse)

3. **Protocol Version Issues**:
   - Make sure both your server and the inspector are using the same protocol version (2024-11-05)

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

The project includes a web-based test client accessible at `http://localhost:5002` (or your configured CLIENT_PORT) when you run the client component. This web interface allows you to:

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
