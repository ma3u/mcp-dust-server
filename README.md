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

The server requires several environment variables to be set in your `.env` file. You can copy the example below and update the values according to your setup:

```bash
# MCP Server Configuration
MCP_NAME=Dust MCP Server JS
MCP_HOST=127.0.0.1
MCP_PORT=5001
MCP_TIMEOUT=30 # seconds

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

# Server Configuration
PORT=3000
```

Make sure to replace all placeholder values with your actual configuration.

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

## Integration

### Windsurf IDE

### Claude Desktop