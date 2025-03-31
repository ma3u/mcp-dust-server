# Dust MCP Server

A Model Context Protocol (MCP) bridge server that connects Windsurf IDE and Claude Desktop to Dust AI assistant.

## Overview

This project implements an MCP server that acts as a bridge between development tools (Windsurf IDE, Claude Desktop) and Dust.tt AI assistants. It allows you to communicate with your configured Dust agents directly from your development environment.

## Features

- Connect to your Dust.tt workspace and agents
- Query Dust agents directly from Windsurf or Claude Desktop
- Stream agent responses back to your development tools
- Handle errors gracefully

## Prerequisites

- Node.js (v16+)
- npm or yarn
- A Dust.tt account with API access
- A configured Dust agent

## Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/Ma3u/mcp-dust-server.git
   cd mcp-dust-server
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create your `.env` file:
   ```bash
   cp .env.example .env
   ```

4. Configure your environment variables in the `.env` file (see Configuration section below)

## Configuration

The server requires several environment variables to be set in your `.env` file:

### MCP Server Configuration
```
MCP_NAME = 'Dust MCP Server JS'
MCP_HOST = '127.0.0.1'
MCP_PORT = '5001'
MCP_TIMEOUT = '30'  # seconds
```

### Dust API Configuration
```
DUST_API_KEY=your_dust_api_key
DUST_WORKSPACE_ID=your_workspace_id
DUST_AGENT_ID=your_agent_id
DUST_DOMAIN=https://dust.tt
```

### User Context Information
```
DUST_USERNAME=Your Name
DUST_EMAIL=your.email@example.com
DUST_FULLNAME=Your Full Name
DUST_TIMEZONE=Europe/Berlin
```

### Server Configuration
```
PORT=3000
```

## Starting the Server

Run the server using:

```bash
npx ts-node src/server.ts
```

You should see output similar to:
```
MCP Server running...
Server name: Dust MCP Server JS
Dust workspace: your_workspace_id
Dust agent: your_agent_id
```

## Integration with Windsurf IDE

### Setting up Windsurf MCP Integration

1. Open Windsurf IDE
2. Go to Settings → Extensions → MCP
3. Click "Add MCP Server"
4. Enter the following details:
   - Name: Dust Bridge
   - Host: localhost
   - Port: 5001 (or whatever you configured in MCP_PORT)
   - Protocol: stdio
   - Path: /Users/ma3u/projects/mcp-dust-server/src/server.ts
   - Arguments: (leave empty)
5. Click "Save"

### Using the Dust MCP Server in Windsurf

1. Open a project in Windsurf IDE
2. Access the MCP tools panel (usually in the sidebar)
3. Select "Dust Bridge" from the dropdown
4. Choose one of the available tools:
   - `echo` - Simple echo tool for testing
   - `dust-query` - Tool to query your Dust agent

5. For `dust-query`, enter your question or request in the "query" field
6. Click "Run" to send the request to your Dust agent
7. View the response in the output panel

### Working with GitHub and JIRA

For users working on the P4XAI project, you can use this MCP server alongside your GitHub and JIRA integrations:

1. Connect Windsurf to GitHub using the GitHub MCP integration
2. Connect Windsurf to JIRA using the Atlassian MCP integration 
3. Use the Dust MCP integration to get AI assistance while working on tickets

## Integration with Claude Desktop

### Setting up Claude Desktop MCP Integration

1. Open Claude Desktop
2. Go to Settings → MCP → Add Server
3. Configure the MCP server:
   - Name: Dust Bridge
   - Host: localhost
   - Port: 5001
   - Protocol: stdio
   - Command: npx ts-node /Users/ma3u/projects/mcp-dust-server/src/server.ts
4. Click "Save"

### Using the Dust MCP Server in Claude Desktop

1. Open Claude Desktop
2. Select "Dust Bridge" from the MCP servers dropdown
3. Choose the `dust-query` tool
4. Enter your query
5. Click "Submit" to send the request to your Dust agent
6. View the response in Claude's chat interface

## Available Tools

### echo

A simple echo tool that returns the message you send. Useful for testing the MCP connection.

**Parameters:**
- `message`: The text to echo back

### dust-query

Sends a query to your configured Dust agent and returns the response.

**Parameters:**
- `query`: Your question or request for the AI agent

## Troubleshooting

### Connection Issues

If you're having trouble connecting to the MCP server:

1. Make sure the server is running (`npx ts-node src/server.ts`)
2. Check that the port (default: 5001) is not being used by another application
3. Verify your MCP configuration in Windsurf/Claude Desktop matches your server settings

### Dust API Issues

If you're having trouble with Dust API integration:

1. Verify your Dust API key is correct
2. Ensure your Dust workspace ID and agent ID are correct
3. Check that your agent is active in the Dust platform
4. Look for error messages in the server console

## License

MIT

## Author

Matthias Buchhorn (Ma3u)
