# MCP Dust Server

This repository contains an implementation of a Model Context Protocol (MCP) server designed to interact with Dust agents. The server is separated into two main components: the MCP server (which handles Dust API interactions) and the MCP test client (which provides a web interface for testing).

## Features

- Separate MCP server and test client components
- Interaction with Dust AI agents via the Dust API
- Real-time streaming responses using Server-Sent Events (SSE)
- Session management and context preservation
- Secure API key handling

## Installation

### Prerequisites
- Node.js (recommended: latest LTS version installed via [nvm](https://github.com/nvm-sh/nvm))
- npm (comes with Node.js)
- TypeScript

### Steps
1. Clone the repository:
   ```bash
   git clone https://github.com/ma3u/mcp-dust-server.git
   cd mcp-dust-server
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables:
   Create a `.env` file in the root directory based on `.env.example`:

   ```env
   # Startup Mode (server, client, or both)
   START_MODE=both
   
   # MCP Server Configuration
   MCP_NAME=Dust MCP Server JS
   MCP_HOST=127.0.0.1
   MCP_PORT=5001
   MCP_TIMEOUT=30 # seconds
   
   # MCP Test Client Configuration
   CLIENT_HOST=127.0.0.1
   CLIENT_PORT=5002
   
   # Dust API Configuration
   DUST_API_KEY=your_dust_api_key_here
   DUST_WORKSPACE_ID=your_workspace_id_here
   DUST_AGENT_ID=your_agent_id_here
   DUST_DOMAIN=https://dust.tt
   
   # User Context Information (used in Dust API requests)
   DUST_USERNAME=your_username
   DUST_EMAIL=your_email@example.com
   DUST_FULLNAME=Your Full Name
   DUST_TIMEZONE=Europe/Berlin
   ```


## Starting the Server and Client

You can run the MCP server and test client separately or together. The project provides several npm scripts for different scenarios:

### Development Mode

1. **Start both Server and Client**:
   ```bash
   npm run dev
   ```


2. **Start MCP Server only**:
   ```bash
   npm run dev:server
   ```


3. **Start Test Client only**:
   ```bash
   npm run dev:client
   ```


### Production Mode

1. **Start both Server and Client**:
   ```bash
   npm run start
   ```


2. **Start MCP Server only**:
   ```bash
   npm run start:server
   ```


3. **Start Test Client only**:
   ```bash
   npm run start:client
   ```


### Expected Output
If everything is configured correctly, you should see output similar to:

**For the MCP Server**:

```text
MCP Server running on http://127.0.0.1:5001 (timeout: 30s)
Server name: Dust MCP Bridge
Dust workspace: your_workspace_id
Dust agent: your_agent_id
```

**For the Test Client**:

```text
MCP Test Client running on http://127.0.0.1:5002
```

---

## Integration

### Windsurf IDE Configuration

To integrate the Dust MCP Server with Windsurf IDE, update the configuration file `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "dust-mcp": {
      "command": "npm",
      "args": [
        "run",
        "start:server"
      ],
      "env": {
        "DUST_API_KEY": "${YOUR_API_KEY}",
        "DUST_WORKSPACE_ID": "${YOUR_WORKSPACE_ID}",
        "DUST_AGENT_ID": "${YOUR_AGENT_ID}"
      },
      "host": "127.0.0.1",
      "port": 5001,
      "timeout": 30000
    }
  }
}
```

### Claude Desktop Integration

To integrate the Dust MCP Server with Claude Desktop, update its configuration file:

```json
{
  "mcpServers": {
    "dust-agent": {
      "command": "npm",
      "args": [
        "run",
        "start:server"
      ],
      "cwd": "path/to/mcp-dust-server",
      "host": "127.0.0.1",
      "port": 5001,
      "timeout": 30000,
      "env": {
        "DUST_API_KEY": "${YOUR_API_KEY}",
        "DUST_WORKSPACE_ID": "${YOUR_WORKSPACE_ID}",
        "DUST_AGENT_ID": "${YOUR_AGENT_ID}"
      }
    }
  }
}
```


## Testing with the Web Client

The project includes a web-based test client accessible at `http://localhost:5002` (or your configured CLIENT_PORT) when you run the client component. This web interface allows you to:

1. Connect to the MCP server via SSE
2. Send test echo messages
3. Send queries to your Dust agent
4. View responses in real-time

## API Documentation

### MCP Server Endpoints

- `GET /health` - Server health check
- `GET /sse` - Establish SSE connection
- `POST /message/:sessionId` - Send message to an established session
- `GET /debug/sessions` - View active session information (development only)
- `GET /debug/connections` - View active connection information (development only)

### MCP Tools

1. **echo**
   - Description: Echoes back the provided message (for testing)
   - Parameters: `message` (string)

2. **dust-query**
   - Description: Send a query to your Dust AI agent
   - Parameters: `query` (string)

## Development

### Project Structure

```text
src/
├── api/
│   └── dust-client.ts      # Dust API client
├── mcp-server/
│   ├── index.ts            # MCP server entry point
│   └── server.ts           # MCP server implementation
├── mcp-client/
│   └── client-server.ts    # Test client implementation
├── index.ts               # Main entry point
├── utils/
│   ├── secure-logger.js    # Secure logging with API key masking
│   └── session-manager.ts  # Session management utilities
└── types/
    └── index.ts           # TypeScript type definitions
public/
└── test-sse.html         # Web-based test client
```


---

## License

This project is licensed under [MIT License](LICENSE).