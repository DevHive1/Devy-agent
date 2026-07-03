'use strict';
const fs = require('fs');
const path = require('path');
const MCPClient = require('./mcpClient');

/**
 * Loads the MCP configuration file from .devy-agent/mcp.json.
 * @param {string} projectDir - Active project directory.
 * @returns {object} Parsed configuration.
 */
function loadMCPConfig(projectDir) {
  const configPath = path.join(projectDir, '.devy-agent', 'mcp.json');
  try {
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf8');
      return JSON.parse(content);
    }
  } catch (e) {
    console.error(`[MCP Config] Error loading config from ${configPath}:`, e.message);
  }
  return { servers: {} };
}

/**
 * Connects to MCP servers and registers their tools dynamically into the tools registry.
 * @param {object} toolsRegistry - The agent's tools object.
 * @param {string} projectDir - Active project directory.
 * @returns {Promise<object[]>} Array of connected client instances.
 */
async function connectAndRegisterMCP(toolsRegistry, projectDir) {
  const config = loadMCPConfig(projectDir);
  const clients = [];

  if (!config.servers || Object.keys(config.servers).length === 0) {
    return clients;
  }

  for (const [name, serverCfg] of Object.entries(config.servers)) {
    if (!serverCfg.command) continue;

    console.log(`[MCP] Connecting to server "${name}" via "${serverCfg.command}"...`);
    const client = new MCPClient({
      command: serverCfg.command,
      args: serverCfg.args || [],
      env: serverCfg.env || {}
    });

    try {
      await client.connect();
      await client.initialize();
      const mcpTools = await client.listTools();

      for (const tool of mcpTools) {
        // Register in agent's tool registry
        const registryName = `mcp_${name}_${tool.name}`;
        
        // Convert schema properties to description string for description tools Compact
        let schemaDesc = '';
        if (tool.inputSchema && tool.inputSchema.properties) {
          schemaDesc = ' Params: ' + Object.keys(tool.inputSchema.properties).join(', ');
        }

        toolsRegistry[registryName] = {
          description: `[MCP: ${name}] ${tool.description || ''}${schemaDesc}`,
          params: tool.inputSchema || {},
          handler: async (args) => {
            try {
              const res = await client.callTool(tool.name, args);
              return res;
            } catch (err) {
              return { error: `MCP Tool Call Failed: ${err.message}` };
            }
          }
        };
      }

      clients.push(client);
      console.log(`[MCP] Server "${name}" connected. Registered ${mcpTools.length} tools.`);
    } catch (e) {
      console.error(`[MCP] Failed to connect/initialize server "${name}":`, e.message);
      await client.disconnect();
    }
  }

  return clients;
}

module.exports = {
  loadMCPConfig,
  connectAndRegisterMCP
};
