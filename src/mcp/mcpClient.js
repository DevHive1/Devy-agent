'use strict';
const { spawn } = require('child_process');
const readline = require('readline');

class MCPClient {
  constructor({ command, args = [], env = {} }) {
    this.command = command;
    this.args = args;
    this.env = { ...process.env, ...env };
    this.process = null;
    this.nextId = 1;
    this.pendingRequests = {};
    this.rl = null;
  }

  connect() {
    return new Promise((resolve, reject) => {
      try {
        this.process = spawn(this.command, this.args, {
          env: this.env,
          stdio: ['pipe', 'pipe', 'pipe']
        });

        this.process.on('error', (err) => {
          reject(new Error(`Failed to start MCP server: ${err.message}`));
        });

        // Parse stdout line by line
        this.rl = readline.createInterface({
          input: this.process.stdout,
          terminal: false
        });

        this.rl.on('line', (line) => {
          if (!line.trim()) return;
          try {
            const response = JSON.parse(line);
            if (response.id !== undefined && this.pendingRequests[response.id]) {
              const { resolve: reqResolve, reject: reqReject } = this.pendingRequests[response.id];
              delete this.pendingRequests[response.id];
              if (response.error) {
                reqReject(new Error(response.error.message || JSON.stringify(response.error)));
              } else {
                reqResolve(response.result);
              }
            }
          } catch (e) {
            console.error('[MCP Client] Error parsing incoming line:', e.message, line);
          }
        });

        // Capture stderr for debugging
        let stderrBuffer = '';
        this.process.stderr.on('data', (data) => {
          stderrBuffer += data.toString();
        });

        this.process.on('close', (code) => {
          // Reject any remaining pending requests
          Object.values(this.pendingRequests).forEach(({ reject: reqReject }) => {
            reqReject(new Error(`MCP server closed unexpectedly with code ${code}. Stderr: ${stderrBuffer}`));
          });
          this.pendingRequests = {};
        });

        // Quick check if process started successfully
        setTimeout(() => {
          if (this.process.exitCode !== null) {
            reject(new Error(`MCP server exited immediately. Stderr: ${stderrBuffer}`));
          } else {
            resolve();
          }
        }, 100);
      } catch (e) {
        reject(e);
      }
    });
  }

  sendRequest(method, params = {}) {
    return new Promise((resolve, reject) => {
      if (!this.process || this.process.exitCode !== null) {
        return reject(new Error('MCP server is not connected.'));
      }

      const id = this.nextId++;
      this.pendingRequests[id] = { resolve, reject };

      const message = {
        jsonrpc: '2.0',
        id,
        method,
        params
      };

      try {
        this.process.stdin.write(JSON.stringify(message) + '\n');
      } catch (e) {
        delete this.pendingRequests[id];
        reject(new Error(`Failed to write to MCP server stdin: ${e.message}`));
      }
    });
  }

  async initialize() {
    return this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'devy-agent-client',
        version: '1.0.0'
      }
    });
  }

  async listTools() {
    const result = await this.sendRequest('tools/list');
    return result.tools || [];
  }

  async callTool(name, args = {}) {
    return this.sendRequest('tools/call', {
      name,
      arguments: args
    });
  }

  async disconnect() {
    if (this.rl) {
      this.rl.close();
    }
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    this.pendingRequests = {};
  }
}

module.exports = MCPClient;
