Below is the **updated README** with the necessary adaptations to include instructions for starting the MCP server and integrating it with Windsurf IDE and Claude Desktop.

---

# MCP Dust Server

This repository contains an implementation of a Model Context Protocol (MCP) server designed to interact with Dust agents. The server allows querying systems thinking, cognitive neuroscience, and problem-solving strategies via Dust agents.

---

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
   MCP_NAME=Dust MCP Server
   MCP_HOST=127.0.0.1
   MCP_PORT=5001
   DUST_AGENT_ID=your_agent_id
   DUST_API_KEY=your_api_key
   DUST_WORKSPACE_ID=your_workspace_id
   DUST_AGENT_NAME=SystemsThinking
   ```

---

## Starting the Server

To start the server, run the following command:

```bash
npx ts-node src/server.ts
```

### Expected Output:
If everything is configured correctly, you should see something like this:
```
Starting MCP server 'Dust MCP Server' on 127.0.0.1:5001
Connected to Dust agent 'SystemsThinking' (ID: your_agent_id)
```

The server will continue running until interrupted (e.g., with `Ctrl+C`).

---

## Integration

### Windsurf IDE Configuration

To integrate the Dust MCP Server with Windsurf IDE, update the configuration file `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "dust-mcp": {
      "command": "npx",
      "args": [
        "ts-node",
        "/path/to/your/mcp-dust-server/src/server.ts"
      ],
      "env": {
        "MCP_HOST": "127.0.0.1",
        "MCP_PORT": "5001",
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
        "start",
        "--prefix",
        "/path/to/your/mcp-dust-server"
      ],
      "host": "127.0.0.1",
      "port": 5001,
      "timeout": 30000,
      "env": {
        "DUST_API_KEY": "${YOUR_API_KEY}",
        "DUST_AGENT_ID": "${YOUR_AGENT_ID}"
      }
    }
  }
}
```

---

## Example Usage

### Query Example:
Test the integration in Claude Desktop or Windsurf IDE by sending a query like:
```
Use SystemsThinking Agent to analyze our current architecture and suggest improvements based on cognitive neuroscience principles.
```

### Verification Script:
Create a test file `test-integration.ts` to verify your setup:

```typescript
import { config } from 'dotenv';
import fetch from 'node-fetch';

config();

const baseUrl = `http://${process.env.MCP_HOST || '127.0.0.1'}:${process.env.MCP_PORT || '5001'}`;

async function testIntegration() {
  const response = await fetch(`${baseUrl}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'executeToolCall',
      params: {
        toolCall: {
          id: 'query-1',
          name: 'query',
          parameters: {
            prompt: `Explain systems thinking, cognitive neuroscience, and problem-solving strategies.`,
          },
        },
      },
    }),
  });

  const result = await response.json();
  console.log('Agent Response:', result);
}

testIntegration();
```

Run the script using:
```bash
npx ts-node test-integration.ts
```

---

## Troubleshooting

### Common Issues

#### Connection Refused:
Ensure the server is running and accessible at the configured host and port:
```bash
curl -v http://127.0.0.1:5001/health
```

#### Authentication Errors:
Verify your Dust credentials using this command:
```bash
curl -H "Authorization: Bearer $DUST_API_KEY" \
  https://dust.tt/api/v1/w/$DUST_WORKSPACE_ID/assistants/$DUST_AGENT_ID
```

#### Timeout Issues:
Increase timeout in `.env` if needed:
```env
MCP_TIMEOUT=60 # seconds
```

---

## Development Notes

### Live Reloading for Development:
Install `nodemon` for automatic server restarts during development:
```bash
npm install --save-dev nodemon

nodemon --watch src --exec "npx ts-node src/server.ts"
```

---

## License

This project is licensed under [MIT License](LICENSE).